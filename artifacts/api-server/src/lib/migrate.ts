import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * Runs DDL migrations on startup to keep the production schema in sync.
 * Idempotent — safe to run on every startup.
 */
export async function runMigrations() {
  const client = await pool.connect();

  try {
    logger.info("[migrate] Running schema migrations...");

    // PHASE 1: Add 'psicologo' to the role enum.
    // ALTER TYPE ADD VALUE must run OUTSIDE a transaction in PostgreSQL.
    const enumResult = await client.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'psicologo'
          AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'role')
      ) AS exists
    `);

    if (!enumResult.rows[0].exists) {
      logger.info("[migrate] Adding 'psicologo' to role enum...");
      await client.query("ALTER TYPE role ADD VALUE 'psicologo'");
      logger.info("[migrate] ✓ Enum updated");
    }

    // PHASE 2: Create missing tables (inside a transaction for atomicity).
    await client.query("BEGIN");

    await client.query(`
      CREATE TABLE IF NOT EXISTS psychologist_profiles (
        id                    SERIAL PRIMARY KEY,
        user_id               INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        date_of_birth         TEXT,
        profession            TEXT,
        registration_date     TEXT,
        deregistration_date   TEXT,
        commission_percentage TEXT,
        license_number        TEXT,
        created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS availability_slots (
        id               SERIAL PRIMARY KEY,
        psychologist_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        start_time       TIMESTAMP NOT NULL,
        end_time         TIMESTAMP NOT NULL,
        is_available     BOOLEAN NOT NULL DEFAULT TRUE,
        notes            TEXT,
        created_at       TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS reclamaciones (
        id               SERIAL PRIMARY KEY,
        correlativo      TEXT NOT NULL,
        fecha            TEXT NOT NULL,
        tipo_reclamo     TEXT NOT NULL,
        tipo_item        TEXT NOT NULL,
        nombres          TEXT NOT NULL,
        dni              TEXT NOT NULL,
        domicilio        TEXT NOT NULL,
        telefono         TEXT NOT NULL,
        email            TEXT NOT NULL,
        es_menor         BOOLEAN DEFAULT FALSE,
        rep_nombres      TEXT,
        rep_dni          TEXT,
        rep_vinculo      TEXT,
        monto            NUMERIC,
        descripcion_bien TEXT NOT NULL,
        detalle          TEXT NOT NULL,
        pedido           TEXT NOT NULL,
        email_enviado    BOOLEAN DEFAULT FALSE,
        creado_en        TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS patient_profiles (
        id                  SERIAL PRIMARY KEY,
        user_id             INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        apellido_paterno    TEXT,
        apellido_materno    TEXT,
        perioricidad        TEXT,
        fecha_alta          TEXT,
        estado              TEXT DEFAULT 'activo',
        nro_celular         TEXT,
        tipo_documento      TEXT,
        numero_documento    TEXT,
        fecha_nacimiento    TEXT,
        sexo                TEXT,
        direccion           TEXT,
        distrito            TEXT,
        ciudad              TEXT,
        departamento        TEXT,
        pais                TEXT DEFAULT 'Perú',
        psicologa_asignada  TEXT,
        created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id            SERIAL PRIMARY KEY,
        actor_id      INTEGER,
        actor_name    TEXT,
        action        TEXT NOT NULL,
        target_table  TEXT,
        target_id     INTEGER,
        ip_address    TEXT,
        details       JSONB,
        created_at    TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await client.query("COMMIT");

    // Post-COMMIT phases: each runs independently so a failure in one does not block others.
    // Each phase is idempotent, so partial failures are safe to retry on next startup.

    // PHASE 3: Add FK constraint to audit_logs.actor_id → users.id
    try {
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'audit_logs_actor_id_fkey'
              AND table_name = 'audit_logs'
          ) THEN
            ALTER TABLE audit_logs
              ADD CONSTRAINT audit_logs_actor_id_fkey
              FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL;
          END IF;
        END $$
      `);
    } catch (e) { logger.warn({ err: e }, "[migrate] PHASE 3 (FK constraint) skipped"); }

    // PHASE 4: Migrate audit_logs.details from TEXT to JSONB (safe, row-by-row validation)
    try {
      await client.query(`
        CREATE OR REPLACE FUNCTION _abc_safe_jsonb(v TEXT) RETURNS JSONB AS $fn$
        BEGIN
          RETURN v::jsonb;
        EXCEPTION WHEN others THEN
          RETURN NULL;
        END $fn$ LANGUAGE plpgsql;
      `);
      await client.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'audit_logs'
              AND column_name = 'details'
              AND data_type = 'text'
          ) THEN
            UPDATE audit_logs
              SET details = NULL
              WHERE details IS NOT NULL AND details <> ''
                AND _abc_safe_jsonb(details) IS NULL;
            ALTER TABLE audit_logs
              ALTER COLUMN details TYPE JSONB USING NULLIF(details, '')::jsonb;
          END IF;
        END $$
      `);
      await client.query(`DROP FUNCTION IF EXISTS _abc_safe_jsonb`);
    } catch (e) { logger.warn({ err: e }, "[migrate] PHASE 4 (JSONB migration) skipped"); }

    // PHASE 5: Add CHECK constraints for controlled enum fields
    try {
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_patient_profiles_sexo') THEN
            ALTER TABLE patient_profiles ADD CONSTRAINT chk_patient_profiles_sexo
              CHECK (sexo IS NULL OR sexo IN ('masculino', 'femenino', 'otro'));
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_patient_profiles_estado') THEN
            ALTER TABLE patient_profiles ADD CONSTRAINT chk_patient_profiles_estado
              CHECK (estado IS NULL OR estado IN ('activo', 'inactivo', 'suspendido'));
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_patient_profiles_perioricidad') THEN
            ALTER TABLE patient_profiles ADD CONSTRAINT chk_patient_profiles_perioricidad
              CHECK (perioricidad IS NULL OR perioricidad IN ('semanal', 'quincenal', 'mensual', 'intensivo'));
          END IF;
        END $$
      `);
    } catch (e) { logger.warn({ err: e }, "[migrate] PHASE 5 (CHECK constraints) skipped"); }

    // PHASE 6: Add performance indexes on audit_logs filter/sort columns
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs (actor_id);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action);
      `);
    } catch (e) { logger.warn({ err: e }, "[migrate] PHASE 6 (indexes) skipped"); }

    // PHASE 7: Add primer_nombre and segundo_nombre to patient_profiles
    try {
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'patient_profiles' AND column_name = 'primer_nombre'
          ) THEN
            ALTER TABLE patient_profiles ADD COLUMN primer_nombre TEXT;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'patient_profiles' AND column_name = 'segundo_nombre'
          ) THEN
            ALTER TABLE patient_profiles ADD COLUMN segundo_nombre TEXT;
          END IF;
        END $$
      `);
    } catch (e) { logger.warn({ err: e }, "[migrate] PHASE 7 (primer/segundo nombre) skipped"); }

    // PHASE 8: Therapeutic tasks catalog + assignments (Portal Tareas Terapéuticas)
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS therapeutic_tasks (
          id            SERIAL PRIMARY KEY,
          key           TEXT NOT NULL,
          name          TEXT NOT NULL,
          description   TEXT NOT NULL DEFAULT '',
          icon          TEXT NOT NULL DEFAULT 'ClipboardList',
          color         TEXT NOT NULL DEFAULT 'from-teal-500 to-teal-600',
          badge_color   TEXT NOT NULL DEFAULT 'bg-teal-100 text-teal-700',
          route_path    TEXT,
          is_active     BOOLEAN NOT NULL DEFAULT TRUE,
          is_available  BOOLEAN NOT NULL DEFAULT TRUE,
          created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS therapeutic_tasks_key_unique ON therapeutic_tasks (key)
      `);
      // Add target_role column (idempotent) — distinguishes patient vs psicólogo tasks
      await client.query(`
        ALTER TABLE therapeutic_tasks
          ADD COLUMN IF NOT EXISTS target_role TEXT NOT NULL DEFAULT 'paciente'
      `);
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'therapeutic_tasks_target_role_check'
          ) THEN
            ALTER TABLE therapeutic_tasks
              ADD CONSTRAINT therapeutic_tasks_target_role_check
              CHECK (target_role IN ('paciente','psicologo'));
          END IF;
        END$$;
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS task_assignments (
          id              SERIAL PRIMARY KEY,
          task_id         INTEGER NOT NULL REFERENCES therapeutic_tasks(id) ON DELETE RESTRICT,
          paciente_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          assigned_by_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
          psicologo_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
          status          TEXT NOT NULL DEFAULT 'pendiente',
          due_date        TIMESTAMP,
          assigned_at     TIMESTAMP NOT NULL DEFAULT NOW(),
          started_at      TIMESTAMP,
          completed_at    TIMESTAMP,
          notes           TEXT,
          created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
          CONSTRAINT task_assignments_status_check
            CHECK (status IN ('pendiente','en_progreso','completada','cancelada'))
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS task_assignments_paciente_idx ON task_assignments (paciente_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS task_assignments_psicologo_idx ON task_assignments (psicologo_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS task_assignments_task_idx ON task_assignments (task_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS task_assignments_status_idx ON task_assignments (status)`);

      // Seed the catalog with the tasks already present in the patient panel.
      // ON CONFLICT keeps any admin edits (name/description/availability) intact.
      await client.query(`
        INSERT INTO therapeutic_tasks (key, name, description, icon, color, badge_color, route_path, is_active, is_available)
        VALUES
          ('registro-abc', 'Registro ABC',
           'Identifica situaciones, pensamientos automáticos y sus consecuencias emocionales.',
           'BrainCircuit', 'from-indigo-500 to-purple-600',
           'bg-indigo-100 text-indigo-700', '/register-abc', TRUE, TRUE),
          ('rueda-vida', 'La Rueda de la Vida',
           'Evalúa el equilibrio en las distintas áreas de tu vida personal y profesional.',
           'Circle', 'from-slate-300 to-slate-400',
           'bg-slate-100 text-slate-500', NULL, TRUE, FALSE),
          ('anamnesis-menor', 'Anamnesis menor 18',
           'Historia clínica completa para pacientes menores de 18 años: datos generales, embarazo, desarrollo motor, lenguaje, salud, escolaridad y relaciones familiares.',
           'FileText', 'from-amber-500 to-orange-600',
           'bg-amber-100 text-amber-700', '/anamnesis-menor', TRUE, TRUE),
          ('primera-consulta-ninos', 'Primera consulta niños',
           'Formulario de admisión para la primera consulta psicológica del menor: datos del niño y los padres, motivo, desarrollo, comportamiento, salud y objetivos terapéuticos.',
           'ClipboardList', 'from-sky-500 to-cyan-600',
           'bg-sky-100 text-sky-700', '/primera-consulta-ninos', TRUE, TRUE),
          ('desarrollo-sesion', 'Desarrollo Sesión',
           'Formato de sesión psicológica para registrar objetivos, resumen, observaciones, evaluación y plan de acción de cada sesión. Puede completarse muchas veces.',
           'Activity', 'from-emerald-500 to-teal-600',
           'bg-emerald-100 text-emerald-700', '/desarrollo-sesion', TRUE, TRUE)
        ON CONFLICT (key) DO NOTHING
      `);

      // "Desarrollo Sesión" es una tarea de uso clínico (notas de sesión del
      // psicólogo), no del paciente. Reasignamos su target_role a 'psicologo'
      // y limpiamos asignaciones obsoletas hechas a usuarios con role='user'.
      await client.query(`
        UPDATE therapeutic_tasks
           SET target_role = 'psicologo', updated_at = NOW()
         WHERE key = 'desarrollo-sesion' AND target_role <> 'psicologo'
      `);
      await client.query(`
        DELETE FROM task_assignments ta
         USING therapeutic_tasks t, users u
         WHERE ta.task_id = t.id
           AND ta.paciente_id = u.id
           AND t.key = 'desarrollo-sesion'
           AND u.role = 'user'
      `);

      await client.query(`
        UPDATE therapeutic_tasks
           SET is_available = TRUE, is_active = TRUE, updated_at = NOW()
         WHERE key IN ('registro-abc','desarrollo-sesion')
      `);
      await client.query(`
        UPDATE therapeutic_tasks
           SET is_available = FALSE, updated_at = NOW()
         WHERE key IN ('anamnesis-menor','primera-consulta-ninos','rueda-vida')
      `);

      // Seed an initial psicólogo-targeted task: "Notas de Sesión"
      await client.query(`
        INSERT INTO therapeutic_tasks
          (key, name, description, icon, color, badge_color, route_path, target_role, is_active, is_available)
        VALUES
          ('notas-sesion-psi', 'Notas de Sesión',
           'Registra las notas clínicas posteriores a cada sesión: observaciones, hipótesis y plan de tratamiento.',
           'FileText', 'from-violet-500 to-purple-600',
           'bg-violet-100 text-violet-700', NULL, 'psicologo', TRUE, TRUE)
        ON CONFLICT (key) DO NOTHING
      `);

      // Backfill psicólogos: cada psicólogo (role='psicologo') tiene una
      // asignación pendiente por cada tarea con target_role='psicologo' y
      // disponible. Idempotente — no duplica.
      // Backfill masivo desactivado — las asignaciones se crean sólo cuando
      // el admin/psicólogo las asigna explícitamente desde el portal.

      // Backfill: cada paciente (role='user') tiene una asignación pendiente
      // de Registro ABC (repetible). Nunca duplica.
      // Backfill masivo desactivado — las asignaciones se crean sólo cuando
      // el admin/psicólogo las asigna explícitamente desde el portal.
    } catch (e) { logger.warn({ err: e }, "[migrate] PHASE 8 (therapeutic tasks) skipped"); }

    // ── PHASE 9: anamnesis records (form responses for "Anamnesis menor 18") ──
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS anamnesis_records (
          id              SERIAL PRIMARY KEY,
          paciente_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          assignment_id   INT REFERENCES task_assignments(id) ON DELETE SET NULL,
          nombre_nino     TEXT NOT NULL DEFAULT '',
          edad            TEXT,
          sexo            TEXT,
          motivo_consulta TEXT,
          entrevistador   TEXT,
          data            JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS anamnesis_records_paciente_idx ON anamnesis_records (paciente_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS anamnesis_records_assignment_idx ON anamnesis_records (assignment_id)`);
    } catch (e) { logger.warn({ err: e }, "[migrate] PHASE 9 (anamnesis records) skipped"); }

    // ── PHASE 10: primera consulta niños records ────────────────────────────
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS primera_consulta_records (
          id              SERIAL PRIMARY KEY,
          paciente_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          assignment_id   INT REFERENCES task_assignments(id) ON DELETE SET NULL,
          nombre_nino     TEXT NOT NULL DEFAULT '',
          edad            TEXT,
          motivo_consulta TEXT,
          data            JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS primera_consulta_records_paciente_idx ON primera_consulta_records (paciente_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS primera_consulta_records_assignment_idx ON primera_consulta_records (assignment_id)`);
    } catch (e) { logger.warn({ err: e }, "[migrate] PHASE 10 (primera consulta records) skipped"); }

    // ── PHASE 11: desarrollo sesión records (formato de sesión psicológica) ──
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS desarrollo_sesion_records (
          id              SERIAL PRIMARY KEY,
          paciente_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          assignment_id   INT REFERENCES task_assignments(id) ON DELETE SET NULL,
          fecha_sesion    TEXT,
          hora_sesion     TEXT,
          numero_sesion   TEXT,
          data            JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS desarrollo_sesion_records_paciente_idx ON desarrollo_sesion_records (paciente_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS desarrollo_sesion_records_assignment_idx ON desarrollo_sesion_records (assignment_id)`);
    } catch (e) { logger.warn({ err: e }, "[migrate] PHASE 11 (desarrollo sesion records) skipped"); }

    // ── PHASE 12: consulta psicológica jóvenes y adultos records ───────────
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS consulta_psicologica_records (
          id                       SERIAL PRIMARY KEY,
          paciente_id              INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          assignment_id            INT REFERENCES task_assignments(id) ON DELETE SET NULL,
          fecha_consulta           TEXT,
          nombre_persona_consulta  TEXT,
          nombre_paciente          TEXT,
          data                     JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at               TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS consulta_psicologica_records_paciente_idx ON consulta_psicologica_records (paciente_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS consulta_psicologica_records_assignment_idx ON consulta_psicologica_records (assignment_id)`);

      // Catálogo: nueva tarea repetible para pacientes jóvenes/adultos.
      await client.query(`
        INSERT INTO therapeutic_tasks
          (key, name, description, icon, color, badge_color, route_path, target_role, is_active, is_available)
        VALUES
          ('consulta-psicologica-adultos', 'Consulta Psicológica Jóvenes y Adultos',
           'Formulario de consulta para jóvenes y adultos: datos personales, motivo, hábitos, estado emocional y objetivos. Puede completarse muchas veces.',
           'ClipboardList', 'from-rose-500 to-pink-600',
           'bg-rose-100 text-rose-700', '/consulta-psicologica-adultos', 'paciente', TRUE, TRUE)
        ON CONFLICT (key) DO NOTHING
      `);
      await client.query(`
        UPDATE therapeutic_tasks
           SET is_available = TRUE, is_active = TRUE, updated_at = NOW()
         WHERE key = 'consulta-psicologica-adultos'
      `);

      // Backfill: cada paciente recibe una asignación pendiente repetible.
      // Backfill masivo desactivado — las asignaciones se crean sólo cuando
      // el admin/psicólogo las asigna explícitamente desde el portal.
    } catch (e) { logger.warn({ err: e }, "[migrate] PHASE 12 (consulta psicológica records) skipped"); }

    // ── PHASE 13: nueva tarea repetible "Desarrollo por sesión jóvenes y adultos"
    // para pacientes (mismo formato del PDF que ya usa DesarrolloSesionForm).
    // Reutiliza la tabla `desarrollo_sesion_records` (paciente_id, data jsonb).
    try {
      await client.query(`
        INSERT INTO therapeutic_tasks
          (key, name, description, icon, color, badge_color, route_path, target_role, is_active, is_available)
        VALUES
          ('desarrollo-sesion-paciente', 'Desarrollo por sesión jóvenes y adultos',
           'Formato de sesión psicológica para jóvenes y adultos: objetivos, resumen, observaciones, tareas, evaluación y plan de acción. Puede completarse muchas veces.',
           'Activity', 'from-emerald-500 to-teal-600',
           'bg-emerald-100 text-emerald-700', '/desarrollo-sesion-paciente', 'paciente', TRUE, TRUE)
        ON CONFLICT (key) DO NOTHING
      `);
      await client.query(`
        UPDATE therapeutic_tasks
           SET is_available = TRUE, is_active = TRUE, updated_at = NOW()
         WHERE key = 'desarrollo-sesion-paciente'
      `);
      // Backfill: cada paciente recibe una asignación pendiente repetible.
      // Backfill masivo desactivado — las asignaciones se crean sólo cuando
      // el admin/psicólogo las asigna explícitamente desde el portal.
    } catch (e) { logger.warn({ err: e }, "[migrate] PHASE 13 (desarrollo sesión paciente) skipped"); }

    // ── PHASE 14: Plan de intervención jóvenes y adultos (paciente, repetible)
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS plan_intervencion_records (
          id              SERIAL PRIMARY KEY,
          paciente_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          assignment_id   INT REFERENCES task_assignments(id) ON DELETE SET NULL,
          paciente_nombre TEXT,
          fecha_emision   TEXT,
          responsable     TEXT,
          data            JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS plan_intervencion_records_paciente_idx ON plan_intervencion_records (paciente_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS plan_intervencion_records_assignment_idx ON plan_intervencion_records (assignment_id)`);

      await client.query(`
        INSERT INTO therapeutic_tasks
          (key, name, description, icon, color, badge_color, route_path, target_role, is_active, is_available)
        VALUES
          ('plan-intervencion-adultos', 'Plan de intervención jóvenes y adultos',
           'Plan de intervención psicológica para jóvenes y adultos: datos generales, objetivo general y 8 sesiones (objetivo específico, actividades, tiempo y materiales). Puede completarse muchas veces.',
           'Target', 'from-indigo-500 to-violet-600',
           'bg-indigo-100 text-indigo-700', '/plan-intervencion-adultos', 'paciente', TRUE, TRUE)
        ON CONFLICT (key) DO NOTHING
      `);
      await client.query(`
        UPDATE therapeutic_tasks
           SET is_available = TRUE, is_active = TRUE, updated_at = NOW()
         WHERE key = 'plan-intervencion-adultos'
      `);
      // Backfill: cada paciente recibe una asignación pendiente repetible.
      // Backfill masivo desactivado — las asignaciones se crean sólo cuando
      // el admin/psicólogo las asigna explícitamente desde el portal.
    } catch (e) { logger.warn({ err: e }, "[migrate] PHASE 14 (plan intervención adultos) skipped"); }

    // ── PHASE 15: Plan de intervención niños (paciente, repetible) ─────────
    // Reutiliza la tabla `plan_intervencion_records` (mismo formato del PDF).
    try {
      await client.query(`
        INSERT INTO therapeutic_tasks
          (key, name, description, icon, color, badge_color, route_path, target_role, is_active, is_available)
        VALUES
          ('plan-intervencion-ninos', 'Plan de intervención niños',
           'Plan de intervención psicológica para niños: datos generales, objetivo general y 8 sesiones (objetivo específico, actividades, tiempo y materiales). Puede completarse muchas veces.',
           'Target', 'from-amber-500 to-orange-600',
           'bg-amber-100 text-amber-700', '/plan-intervencion-ninos', 'paciente', TRUE, TRUE)
        ON CONFLICT (key) DO NOTHING
      `);
      await client.query(`
        UPDATE therapeutic_tasks
           SET is_available = TRUE, is_active = TRUE, updated_at = NOW()
         WHERE key = 'plan-intervencion-ninos'
      `);
      // Backfill masivo desactivado — las asignaciones se crean sólo cuando
      // el admin/psicólogo las asigna explícitamente desde el portal.
    } catch (e) { logger.warn({ err: e }, "[migrate] PHASE 15 (plan intervención niños) skipped"); }

    // ── PHASE 16: backfill patient_profiles for any paciente que no tenga uno ──
    try {
      const r = await client.query(`
        INSERT INTO patient_profiles (user_id, estado, pais, created_at, updated_at)
        SELECT u.id, 'activo', 'Perú', NOW(), NOW()
          FROM users u
          LEFT JOIN patient_profiles pp ON pp.user_id = u.id
         WHERE u.role = 'user' AND pp.id IS NULL
        RETURNING id
      `);
      if (r.rowCount && r.rowCount > 0) {
        logger.info(`[migrate] ✓ PHASE 16: created ${r.rowCount} patient_profiles for existing pacientes`);
      }
    } catch (e) { logger.warn({ err: e }, "[migrate] PHASE 16 (backfill patient_profiles) skipped"); }

    // ── PHASE 17: drop redundant patient_profiles.costo_terapia ──
    // tarifas_paciente es la fuente única de costos por sesión.
    try {
      await client.query(`ALTER TABLE patient_profiles DROP COLUMN IF EXISTS costo_terapia`);
    } catch (e) { logger.warn({ err: e }, "[migrate] PHASE 17 (drop costo_terapia) skipped"); }

    // ── PHASE 18: Línea de Vida (paciente, repetible) ─────────────────────
    // Tabla de registros + nueva tarea en el catálogo + backfill de
    // asignaciones para cada paciente existente.
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS linea_vida_records (
          id                       SERIAL PRIMARY KEY,
          paciente_id              INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          assignment_id            INT REFERENCES task_assignments(id) ON DELETE SET NULL,
          presente_circunstancias  TEXT,
          reflexion_patrones       TEXT,
          fortalezas_vitales       TEXT,
          aprendizajes_generales   TEXT,
          eventos                  JSONB NOT NULL DEFAULT '[]'::jsonb,
          data                     JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at               TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS linea_vida_records_paciente_idx ON linea_vida_records (paciente_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS linea_vida_records_assignment_idx ON linea_vida_records (assignment_id)`);

      await client.query(`
        INSERT INTO therapeutic_tasks
          (key, name, description, icon, color, badge_color, route_path, target_role, is_active, is_available)
        VALUES
          ('linea-de-vida', 'Línea de Vida',
           'Construye una línea temporal con los acontecimientos vitales más significativos de tu vida y reflexiona sobre los patrones, aprendizajes y emociones asociadas.',
           'Activity', 'from-violet-500 to-fuchsia-600',
           'bg-violet-100 text-violet-700', '/linea-de-vida', 'paciente', TRUE, TRUE)
        ON CONFLICT (key) DO NOTHING
      `);
      await client.query(`
        UPDATE therapeutic_tasks
           SET is_available = TRUE, is_active = TRUE, updated_at = NOW()
         WHERE key = 'linea-de-vida'
      `);
      // Backfill masivo desactivado — las asignaciones se crean sólo cuando
      // el admin/psicólogo las asigna explícitamente desde el portal.
    } catch (e) { logger.warn({ err: e }, "[migrate] PHASE 18 (línea de vida) skipped"); }

    // ── PHASE 19: Consentimiento Informado (paciente, único) ──────────────
    // Tabla legal de aceptación + nueva tarea en el catálogo + backfill de
    // asignaciones para cada paciente existente. Cumple Ley 29733 / MINSA.
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS consentimiento_informado_records (
          id                       SERIAL PRIMARY KEY,
          paciente_id              INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          assignment_id            INT REFERENCES task_assignments(id) ON DELETE SET NULL,
          accepted                 BOOLEAN NOT NULL DEFAULT FALSE,
          accepted_at              TIMESTAMP,
          full_name                TEXT NOT NULL,
          document_type            TEXT NOT NULL,
          document_number          TEXT NOT NULL,
          ip_address               TEXT,
          user_agent               TEXT,
          consent_version          TEXT NOT NULL,
          consent_text_snapshot    TEXT NOT NULL,
          created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at               TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS consentimiento_informado_paciente_idx ON consentimiento_informado_records (paciente_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS consentimiento_informado_assignment_idx ON consentimiento_informado_records (assignment_id)`);

      await client.query(`
        INSERT INTO therapeutic_tasks
          (key, name, description, icon, color, badge_color, route_path, target_role, is_active, is_available)
        VALUES
          ('consentimiento-informado', 'Consentimiento Informado',
           'Lee y acepta el consentimiento informado para el tratamiento de tu información clínica digital, según la Ley N.° 29733 y la normativa del MINSA. Requisito obligatorio antes de continuar tu atención.',
           'FileText', 'from-sky-500 to-blue-600',
           'bg-sky-100 text-sky-700', '/consentimiento-informado', 'paciente', TRUE, TRUE)
        ON CONFLICT (key) DO NOTHING
      `);
      await client.query(`
        UPDATE therapeutic_tasks
           SET is_available = TRUE, is_active = TRUE, updated_at = NOW()
         WHERE key = 'consentimiento-informado'
      `);
      // Backfill masivo desactivado — las asignaciones se crean sólo cuando
      // el admin/psicólogo las asigna explícitamente desde el portal.
    } catch (e) { logger.warn({ err: e }, "[migrate] PHASE 19 (consentimiento informado) skipped"); }

    // ── PHASE 20: Limpieza de asignaciones masivas no utilizadas ──────────
    // Versiones anteriores asignaban automáticamente todas las tareas-paciente
    // a todos los usuarios al arrancar (notes='Asignación masiva inicial.').
    // Eso hacía que el portal del paciente mostrara tareas que el admin nunca
    // asignó. Borramos sólo las que están todavía 'pendiente' y nunca fueron
    // iniciadas ni completadas — preservamos todo el progreso real.
    try {
      await client.query(`
        DELETE FROM task_assignments
         WHERE notes = 'Asignación masiva inicial.'
           AND status = 'pendiente'
           AND started_at IS NULL
           AND completed_at IS NULL
      `);
    } catch (e) { logger.warn({ err: e }, "[migrate] PHASE 20 (cleanup mass assignments) skipped"); }

    // ── PHASE 21: Distorsiones de la percepción de la realidad (paciente, repetible)
    // Tarea CBT con 10 items (escala 0-100) que el paciente puede llenar
    // múltiples veces. Edición/borrado permitidos sólo dentro de las 48 horas
    // posteriores a la creación.
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS distorsiones_records (
          id              SERIAL PRIMARY KEY,
          paciente_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          assignment_id   INT REFERENCES task_assignments(id) ON DELETE SET NULL,
          items           JSONB NOT NULL DEFAULT '[]'::jsonb,
          notas           TEXT,
          created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS distorsiones_records_paciente_idx ON distorsiones_records (paciente_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS distorsiones_records_assignment_idx ON distorsiones_records (assignment_id)`);

      await client.query(`
        INSERT INTO therapeutic_tasks
          (key, name, description, icon, color, badge_color, route_path, target_role, is_active, is_available)
        VALUES
          ('distorsiones-realidad', 'Distorsiones de la percepción de la realidad',
           'Identifica el grado en que diferentes distorsiones cognitivas (pensamiento todo-o-nada, generalización excesiva, filtro mental, etc.) están presentes en tu pensamiento. Puede completarse muchas veces para registrar tu evolución.',
           'BrainCircuit', 'from-amber-500 to-rose-500',
           'bg-amber-100 text-amber-800', '/distorsiones-realidad', 'paciente', TRUE, TRUE)
        ON CONFLICT (key) DO NOTHING
      `);
      await client.query(`
        UPDATE therapeutic_tasks
           SET is_available = TRUE, is_active = TRUE, updated_at = NOW()
         WHERE key = 'distorsiones-realidad'
      `);
    } catch (e) { logger.warn({ err: e }, "[migrate] PHASE 21 (distorsiones realidad) skipped"); }

    // ── PHASE 22: Distorsiones — split del ítem 5 en lectura/anticipación.
    // El catálogo de ítems pasó de 10 a 11. Los registros existentes (aún en
    // desarrollo, autorizado por el cliente a borrar) son incompatibles con la
    // nueva lista de claves, así que se vacían UNA sola vez. Usamos una tabla
    // de marcadores idempotente para no re-borrar en cada arranque.
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS migration_flags (
          flag        TEXT PRIMARY KEY,
          applied_at  TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      const r = await client.query<{ flag: string }>(
        `SELECT flag FROM migration_flags WHERE flag = 'distorsiones_split_v2'`
      );
      if (r.rows.length === 0) {
        await client.query(`TRUNCATE TABLE distorsiones_records RESTART IDENTITY`);
        await client.query(
          `INSERT INTO migration_flags (flag) VALUES ('distorsiones_split_v2') ON CONFLICT DO NOTHING`
        );
        logger.info("[migrate] ✓ PHASE 22: distorsiones_records vaciada (split v2)");
      }
    } catch (e) { logger.warn({ err: e }, "[migrate] PHASE 22 (distorsiones split v2) skipped"); }

    // ── PHASE 23: La Rueda de la Vida — tabla de registros + catálogo activo.
    // Tarea repetible: el paciente puede llenar varias veces a lo largo del
    // tiempo y comparar la evolución. Edición/borrado dentro de 48h, en
    // línea con el resto de tareas terapéuticas.
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS rueda_vida_records (
          id                    SERIAL PRIMARY KEY,
          paciente_id           INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          assignment_id         INT REFERENCES task_assignments(id) ON DELETE SET NULL,
          items                 JSONB NOT NULL DEFAULT '[]'::jsonb,
          accion_semilla_area   TEXT,
          accion_semilla        TEXT,
          accion_semilla_fecha  TEXT,
          notas                 TEXT,
          created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at            TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS rueda_vida_records_paciente_idx ON rueda_vida_records (paciente_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS rueda_vida_records_assignment_idx ON rueda_vida_records (assignment_id)`);

      // El catálogo ya tenía 'rueda-vida' como "próximamente". Ahora lo
      // activamos y refrescamos su descripción/colores en línea con las
      // demás tareas habilitadas.
      await client.query(`
        UPDATE therapeutic_tasks
           SET name = 'La Rueda de la Vida',
               description = 'Evalúa el nivel de satisfacción en 10 áreas clave de tu vida (salud, finanzas, familia, ocio, etc.) y define una acción semilla para mejorar tu equilibrio. Puede completarse muchas veces para registrar tu evolución.',
               icon = 'Circle',
               color = 'from-teal-500 to-cyan-600',
               badge_color = 'bg-teal-100 text-teal-800',
               route_path = '/rueda-vida',
               target_role = 'paciente',
               is_active = TRUE,
               is_available = TRUE,
               updated_at = NOW()
         WHERE key = 'rueda-vida'
      `);
      // Por si la fila no existía (instalaciones nuevas).
      await client.query(`
        INSERT INTO therapeutic_tasks
          (key, name, description, icon, color, badge_color, route_path, target_role, is_active, is_available)
        VALUES
          ('rueda-vida', 'La Rueda de la Vida',
           'Evalúa el nivel de satisfacción en 10 áreas clave de tu vida (salud, finanzas, familia, ocio, etc.) y define una acción semilla para mejorar tu equilibrio. Puede completarse muchas veces para registrar tu evolución.',
           'Circle', 'from-teal-500 to-cyan-600',
           'bg-teal-100 text-teal-800', '/rueda-vida', 'paciente', TRUE, TRUE)
        ON CONFLICT (key) DO NOTHING
      `);
    } catch (e) { logger.warn({ err: e }, "[migrate] PHASE 23 (rueda de la vida) skipped"); }

    // ── PHASE 24: Creencias irracionales — tabla de registros + catálogo.
    // Tarea repetible para pacientes (11 creencias irracionales de Ellis,
    // cada una calificada de 0 a 100). Edición/borrado dentro de 48h.
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS creencias_irracionales_records (
          id              SERIAL PRIMARY KEY,
          paciente_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          assignment_id   INT REFERENCES task_assignments(id) ON DELETE SET NULL,
          items           JSONB NOT NULL DEFAULT '[]'::jsonb,
          notas           TEXT,
          created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS creencias_irracionales_records_paciente_idx ON creencias_irracionales_records (paciente_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS creencias_irracionales_records_assignment_idx ON creencias_irracionales_records (assignment_id)`);

      await client.query(`
        INSERT INTO therapeutic_tasks
          (key, name, description, icon, color, badge_color, route_path, target_role, is_active, is_available)
        VALUES
          ('creencias-irracionales', 'Creencias irracionales',
           'Identifica el grado en que están presentes 11 creencias irracionales (necesidad de aprobación, autoexigencia, catastrofismo, dependencia, etc.) en tu manera de pensar. Puede completarse muchas veces para registrar tu evolución.',
           'BrainCircuit', 'from-rose-400 to-amber-400',
           'bg-rose-100 text-rose-800', '/creencias-irracionales', 'paciente', TRUE, TRUE)
        ON CONFLICT (key) DO NOTHING
      `);
      await client.query(`
        UPDATE therapeutic_tasks
           SET is_available = TRUE, is_active = TRUE, updated_at = NOW()
         WHERE key = 'creencias-irracionales'
      `);
    } catch (e) { logger.warn({ err: e }, "[migrate] PHASE 24 (creencias irracionales) skipped"); }

    // ── PHASE 25: Tareas "para Psicólogos" parte 2 —
    //   (a) tabla psychologist_task_access: habilitación por psicólogo de tareas
    //       cuyo target_role='psicologo' (sin fila = NO disponible).
    //   (b) columna psicologo_id en cada tabla de registros: cuando un psicólogo
    //       llena una tarea para un paciente, el registro lleva psicologo_id; así
    //       el paciente NUNCA lo ve (su GET /mine filtra psicologo_id IS NULL).
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS psychologist_task_access (
          id SERIAL PRIMARY KEY,
          psicologo_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          task_id INTEGER NOT NULL REFERENCES therapeutic_tasks(id) ON DELETE CASCADE,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS psychologist_task_access_unique
          ON psychologist_task_access (psicologo_id, task_id);
        CREATE INDEX IF NOT EXISTS psychologist_task_access_psicologo_idx
          ON psychologist_task_access (psicologo_id);
        CREATE INDEX IF NOT EXISTS psychologist_task_access_task_idx
          ON psychologist_task_access (task_id);
      `);

      const recordTables = [
        "anamnesis_records",
        "primera_consulta_records",
        "desarrollo_sesion_records",
        "consulta_psicologica_records",
        "plan_intervencion_records",
        "linea_vida_records",
        "consentimiento_informado_records",
        "distorsiones_records",
        "rueda_vida_records",
        "creencias_irracionales_records",
      ];
      for (const tbl of recordTables) {
        await client.query(`
          ALTER TABLE ${tbl}
            ADD COLUMN IF NOT EXISTS psicologo_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
          CREATE INDEX IF NOT EXISTS ${tbl}_psicologo_idx ON ${tbl} (psicologo_id);
        `);
      }
      logger.info("[migrate] ✓ PHASE 25: psychologist_task_access + psicologo_id en registros");
    } catch (e) { logger.warn({ err: e }, "[migrate] PHASE 25 (tareas para psicólogos parte 2) skipped"); }

    // ── PHASE 26: Tablón de Anuncios — mensajes psicólogo → paciente.
    //   Borrado LÓGICO (auditoría clínica): deleted_by_psi_at oculta a ambos;
    //   deleted_by_paciente_at oculta solo al paciente. read_at = leído por
    //   el paciente; al editar se resetea para re-entregar como nuevo.
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS psi_messages (
          id SERIAL PRIMARY KEY,
          psicologo_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          paciente_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          assignment_id INTEGER REFERENCES task_assignments(id) ON DELETE SET NULL,
          body TEXT NOT NULL,
          read_at TIMESTAMP,
          edited_at TIMESTAMP,
          deleted_by_psi_at TIMESTAMP,
          deleted_by_paciente_at TIMESTAMP,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS psi_messages_paciente_idx ON psi_messages (paciente_id);
        CREATE INDEX IF NOT EXISTS psi_messages_psicologo_idx ON psi_messages (psicologo_id);
      `);
      logger.info("[migrate] ✓ PHASE 26: psi_messages (Tablón de Anuncios)");
    } catch (e) { logger.warn({ err: e }, "[migrate] PHASE 26 (tablón de anuncios) skipped"); }

    logger.info("[migrate] ✓ Schema migrations applied successfully");
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    logger.error({ err }, "[migrate] Migration failed");
    // Don't crash the server — log and continue
  } finally {
    client.release();
  }
}
