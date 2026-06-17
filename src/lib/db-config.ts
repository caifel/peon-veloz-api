/**
 * Database configuration — isolated from the runtime config so drizzle-kit
 * can import it without triggering `loadApiRuntimeConfig()`, which requires
 * env vars (CSRF_SECRET, HOST, etc.) that aren't relevant for migrations.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function loadApiDatabaseConfig() {
  const sqlitePath = required("SQLITE_PATH");
  const databaseUrl = process.env.DATABASE_URL ?? `file:${sqlitePath}`;

  if (!databaseUrl.startsWith("file:")) {
    throw new Error("Invalid DATABASE_URL: expected a file: SQLite URL");
  }

  return {
    sqlitePath,
    databaseUrl,
  };
}
