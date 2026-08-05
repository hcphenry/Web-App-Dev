import app from "./app";
import { logger } from "./lib/logger";
import { runMigrations } from "./lib/migrate";
import { assertPsiRecordTaskKeyCoverage } from "./lib/psiRecords";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

function startServer() {
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });
}

async function bootstrap() {
  // Apply any pending schema migrations before accepting traffic. Migration
  // failures are non-fatal (we still start the server) — historical behavior.
  try {
    await runMigrations();
  } catch (err) {
    logger.error({ err }, "Failed to run migrations, starting server anyway");
  }

  // Assert the "para Psicólogos" record-route task-key map is still in sync with
  // the catalog. Drift here silently breaks the admin enable/disable gate, so it
  // is FATAL: do not start the server, exit non-zero so the failure is loud.
  try {
    await assertPsiRecordTaskKeyCoverage();
  } catch (err) {
    logger.error({ err }, "psi record task-key map drifted from the catalog — refusing to start");
    process.exit(1);
  }

  startServer();
}

void bootstrap();
