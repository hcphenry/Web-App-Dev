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
        costo_terapia       TEXT,
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

    logger.info("[migrate] ✓ Schema migrations applied successfully");
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    logger.error({ err }, "[migrate] Migration failed");
    // Don't crash the server — log and continue
  } finally {
    client.release();
  }
}
