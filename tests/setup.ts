/**
 * Test setup — must be imported BEFORE any src/* module.
 * Sets SQLITE_PATH env var so the client picks up the test DB.
 */
import { Database } from "bun:sqlite";
import { mkdirSync, unlinkSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";

const TEST_DB_PATH = resolve(import.meta.dir ?? __dirname, "../data/test.db");

// Set env before any app module loads
process.env.NODE_ENV = "test";
process.env.SQLITE_PATH = TEST_DB_PATH;
process.env.HOST = "0.0.0.0";
process.env.PORT = "4000";
process.env.FRONTEND_URL = "http://localhost:3000";
process.env.CSRF_SECRET = "test-csrf-secret-for-tests-only";
process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

mkdirSync(resolve(import.meta.dir ?? __dirname, "../data"), { recursive: true });

// ── Schema migration — reads actual Drizzle migration files ──────

const MIGRATIONS_DIR = resolve(import.meta.dir ?? __dirname, "../drizzle");
let _testDbInitialized = false;

/**
 * Read all .sql migration files, parse them on statement-breakpoint
 * separators, and return an ordered array of SQL statements.
 */
function loadMigrationStatements(): string[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // 0000 → 0001 → ... maintains order

  const statements: string[] = [];
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
    // Drizzle statements are separated by --> statement-breakpoint
    const parts = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    statements.push(...parts);
  }
  return statements;
}

// ── Public API ──────────────────────────────────────────────────

let _ensureDbPromise: Promise<void> | null = null;

export async function ensureTestDb() {
  if (_testDbInitialized) return;
  if (!_ensureDbPromise) {
    _ensureDbPromise = (async () => {
      if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);

      const sqlite = new Database(TEST_DB_PATH);
      sqlite.run("PRAGMA foreign_keys = ON");
      sqlite.run("PRAGMA journal_mode = WAL");

      const statements = loadMigrationStatements();
      for (const stmt of statements) {
        sqlite.run(stmt);
      }
      sqlite.close();
      _testDbInitialized = true;
      _ensureDbPromise = null;
    })();
  }
  await _ensureDbPromise;
}

export function clearAllTables() {
  const sqlite = new Database(TEST_DB_PATH);
  sqlite.run("PRAGMA foreign_keys = OFF");
  // Order matters for FK constraints
  for (const table of [
    "tournaments",
    "sessions",
    "users",
    "health_checks",
  ]) {
    sqlite.run(`DELETE FROM ${table}`);
  }
  sqlite.run("PRAGMA foreign_keys = ON");
  sqlite.close();
  _sessionCookie = null; // reset auth after clear
}

export function cleanupTestDb() {
  try {
    unlinkSync(TEST_DB_PATH);
  } catch {
    /* ok */
  }
}

// ── HTTP helpers ────────────────────────────────────────────────

let _app: any = null;
let _sessionCookie: string | null = null;
let _csrfToken: string | null = null;

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function getApp() {
  if (!_app) {
    const mod = await import("../src/app");
    _app = mod.app;
  }
  return _app;
}

export async function req(method: string, path: string, body?: unknown) {
  // Auto-bootstrap admin session when no session exists
  // (skip /auth/login to avoid infinite recursion — bootstrapAdmin calls it)
  if (!_sessionCookie && path !== "/api/auth/login") {
    await bootstrapAdmin();
  }
  // Auto-fetch CSRF token for mutations (safe methods skip CSRF)
  if (
    !SAFE_METHODS.has(method) &&
    _sessionCookie &&
    !_csrfToken &&
    path !== "/api/auth/login" &&
    path !== "/api/auth/logout"
  ) {
    _csrfToken = await fetchCsrfToken();
  }
  const app = await getApp();
  const init: RequestInit = { method };
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  if (_sessionCookie) {
    headers["Cookie"] = _sessionCookie;
  }
  if (_csrfToken) {
    headers["X-CSRF-Token"] = _csrfToken;
  }
  if (Object.keys(headers).length > 0) init.headers = headers;
  const res = await app.handle(new Request(`http://localhost${path}`, init));

  // Capture new session cookie from Set-Cookie header (e.g. after login)
  const setCookie =
    (res.headers as any).get?.("set-cookie") ?? (res.headers as any).getSetCookie?.()?.[0];
  if (setCookie && setCookie.startsWith("session=")) {
    _sessionCookie = setCookie.split(";")[0];
    _csrfToken = null; // new session → invalidate cached CSRF token
  }
  // If the response clears the cookie, reset it
  if (setCookie && setCookie.startsWith("session=;")) {
    _sessionCookie = null;
    _csrfToken = null;
  }

  return res;
}

/**
 * Utility to fetch a CSRF token from the authenticated session.
 * Called automatically by req() for mutation requests.
 */
export async function fetchCsrfToken(): Promise<string | null> {
  const app = await getApp();
  const res = await app.handle(
    new Request("http://localhost/api/auth/csrf-token", {
      method: "GET",
      headers: _sessionCookie ? { Cookie: _sessionCookie } : {},
    }),
  );
  if (res.status === 200) {
    const body = await res.json();
    return body.data?.token ?? null;
  }
  return null;
}

export async function json(r: Response) {
  return r.json();
}

/**
 * Create an admin user, log in, and cache the session cookie.
 * Must be called before any mutation requests.
 */
export async function bootstrapAdmin(force = false) {
  if (_sessionCookie && !force) return; // already bootstrapped

  // Reset to ensure fresh admin login
  _sessionCookie = null;
  _csrfToken = null;

  const sqlite = new Database(TEST_DB_PATH);
  sqlite.run("PRAGMA foreign_keys = ON");
  const nowMs = Date.now(); // Drizzle timestamp expects milliseconds
  const nowSec = Math.floor(nowMs / 1000);
  // Check if admin already exists
  const existing = sqlite.query("SELECT id FROM users WHERE email = 'admin@test.com'").get() as { id: number } | undefined;
  let adminId: number;
  if (!existing) {
    const result = sqlite.run(
      "INSERT INTO users (email, first_name, last_name, role, phone, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)",
      ["admin@test.com", "Admin", "User", "admin", "+591 70000000", nowSec, nowSec],
    );
    adminId = Number(result.lastInsertRowid);
  } else {
    adminId = existing.id;
  }

  // Create session directly (bypasses /auth/login, which no longer exists)
  const sessionToken = crypto.randomUUID();
  const tokenHash = Bun.SHA256.hash(sessionToken, "hex");
  const expiresAt = nowMs + 7 * 24 * 60 * 60 * 1000; // 7 days in ms
  sqlite.run(
    "INSERT INTO sessions (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)",
    [adminId, tokenHash, expiresAt, nowMs],
  );
  sqlite.close();

  _sessionCookie = `session=${sessionToken}`;
}

/**
 * Create a user via the API, return its id.
 */
export async function createTestUser(
  email: string,
  firstName = "Test",
  lastName = "User",
  role = "member",
) {
  await bootstrapAdmin(true);
  const res = await req("POST", "/api/users", {
    email,
    firstName,
    lastName,
    role,
    phone: "+591 70000000",
  });
  return (await json(res)).data.id as number;
}

/**
 * Switch the active session to a different user.
 * Creates user + session directly (no password/login flow).
 */
export async function loginAs(email: string) {
  const sqlite = new Database(TEST_DB_PATH);
  sqlite.run("PRAGMA foreign_keys = ON");
  let user = sqlite.query("SELECT id FROM users WHERE email = ?").get(email) as { id: number } | undefined;

  // Auto-bootstrap if switching to admin and admin doesn't exist yet
  if (!user && email === "admin@test.com") {
    sqlite.close();
    await bootstrapAdmin(true);
    const sqlite2 = new Database(TEST_DB_PATH);
    sqlite2.run("PRAGMA foreign_keys = ON");
    user = sqlite2.query("SELECT id FROM users WHERE email = ?").get(email) as { id: number } | undefined;
    if (!user) throw new Error(`User not found after bootstrap: ${email}`);
    const st = crypto.randomUUID();
    const th = Bun.SHA256.hash(st, "hex");
    const ms = Date.now();
    sqlite2.run(
      "INSERT INTO sessions (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)",
      [user.id, th, ms + 7 * 24 * 60 * 60 * 1000, ms],
    );
    sqlite2.close();
    _sessionCookie = `session=${st}`;
    _csrfToken = null;
    return;
  }

  if (!user) throw new Error(`User not found: ${email}`);

  const sessionToken = crypto.randomUUID();
  const tokenHash = Bun.SHA256.hash(sessionToken, "hex");
  const nowMs = Date.now();
  const expiresAt = nowMs + 7 * 24 * 60 * 60 * 1000;
  sqlite.run(
    "INSERT INTO sessions (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)",
    [user.id, tokenHash, expiresAt, nowMs],
  );
  sqlite.close();
  _sessionCookie = `session=${sessionToken}`;
  _csrfToken = null;
}

// ── Redis helpers ──────────────────────────────────────────────

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

export async function flushRedis(): Promise<void> {
  try {
    const { default: Redis } = await import("ioredis");
    const r = new Redis(REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy() {
        return null;
      },
    });
    r.on("error", () => {});
    await r.connect();
    await r.flushall();
    r.disconnect();
  } catch {
    /* Redis is always available — should not happen */
  }
}
