import { pool } from "@workspace/db";

/**
 * Runs DDL migrations on startup to keep the production schema in sync.
 * Idempotent — safe to run on every startup.
 */
export async function runMigrations() {
  const client = await pool.connect();

  try {
    console.log("[migrate] Running schema migrations...");

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
      console.log("[migrate] Adding 'psicologo' to role enum...");
      await client.query("ALTER TYPE role ADD VALUE 'psicologo'");
      console.log("[migrate] ✓ Enum updated");
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
        details       TEXT,
        created_at    TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await client.query("COMMIT");

    console.log("[migrate] ✓ Schema migrations applied successfully");
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("[migrate] Migration failed:", err);
    // Don't crash the server — log and continue
  } finally {
    client.release();
  }
}
