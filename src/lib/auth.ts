/**
 * Auth middleware — session-based, HttpOnly cookies, role guards.
 *
 * Usage in routes:
 *   .use(authPlugin)                          // attaches currentUser
 *   .guard({ beforeHandle: requireAuth }, ...) // rejects 401 if no session
 *   .guard({ beforeHandle: requireRole("admin") }, ...)
 */
import { and, eq, isNull } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../db/client";
import { sessions, users } from "../db/schema";
import { apiConfig } from "./config";
import { Forbidden, Unauthorized } from "./errors";
import { logger } from "./logger";

// ── Config ──────────────────────────────────────────────────────
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// __Host- prefix enforces Secure + Path=/ + no Domain — only use in production
// where HTTPS is available. In dev/test, keep the plain cookie name so HTTP works.
export const COOKIE_NAME = apiConfig.nodeEnv === "production" ? "__Host-session" : "session";

// __Host- prefixed cookies MUST be Secure. In dev, omit Secure to allow local HTTP.
const COOKIE_FLAGS = [
  "HttpOnly",
  ...(apiConfig.nodeEnv === "production" ? ["Secure"] : []),
  `SameSite=Lax`,
  "Path=/",
].join("; ");

function generateToken(): string {
  return crypto.randomUUID();
}

// ── Session helpers ─────────────────────────────────────────────

export async function createSession(userId: number) {
  const token = generateToken();
  const tokenHash = Bun.SHA256.hash(token, "hex"); // token hash for DB, raw token for cookie
  await db.insert(sessions).values({
    userId,
    tokenHash,
    expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
  });
  return token;
}

export async function revokeSession(token: string) {
  const tokenHash = Bun.SHA256.hash(token, "hex");
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)));
}

interface SessionContext {
  user: {
    id: number;
    email: string | null;
    firstName: string;
    lastName: string;
    role: string;
    isActive: boolean;
    lichessUsername: string | null;
  };
  tokenHash: string;
  expiresAt: Date;
}

async function getUserFromToken(token: string): Promise<SessionContext | null> {
  if (!token) return null;
  const tokenHash = Bun.SHA256.hash(token, "hex");
  const [session] = await db
    .select({
      userId: sessions.userId,
      expiresAt: sessions.expiresAt,
      revokedAt: sessions.revokedAt,
    })
    .from(sessions)
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      isActive: users.isActive,
      lichessUsername: users.lichessUsername,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user || !user.isActive) return null;
  return { user, tokenHash, expiresAt: session.expiresAt };
}

// ── Cookie helpers ──────────────────────────────────────────────

function setSessionCookie(set: any, token: string) {
  (set.headers as Record<string, string>)["Set-Cookie"] =
    `${COOKIE_NAME}=${token}; ${COOKIE_FLAGS}; Max-Age=${SESSION_DURATION_MS / 1000}`;
}

function clearSessionCookie(set: any) {
  (set.headers as Record<string, string>)["Set-Cookie"] =
    `${COOKIE_NAME}=; ${COOKIE_FLAGS}; Max-Age=0`;
}

// ── Plugin ──────────────────────────────────────────────────────

export const authPlugin = new Elysia({ name: "auth" }).derive(
  { as: "global" },
  async ({ cookie, set }) => {
    const sessionToken = (cookie as Record<string, { value?: string } | undefined>)[
      COOKIE_NAME
    ]?.value;
    const ctx = sessionToken ? await getUserFromToken(sessionToken) : null;
    const currentUser = ctx?.user ?? null;

    // Lazy session refresh: when less than 50% of the TTL remains,
    // bump expiresAt and refresh the cookie. Active users never get
    // logged out; inactive sessions still expire after SESSION_DURATION_MS.
    // Best-effort — a transient DB error during refresh must not fail
    // the underlying request.
    if (ctx) {
      const remaining = ctx.expiresAt.getTime() - Date.now();
      if (remaining > 0 && remaining < SESSION_DURATION_MS / 2) {
        try {
          const newExpiresAt = new Date(Date.now() + SESSION_DURATION_MS);
          await db
            .update(sessions)
            .set({ expiresAt: newExpiresAt })
            .where(eq(sessions.tokenHash, ctx.tokenHash));
          // sessionToken is non-null when ctx is non-null
          setSessionCookie(set, sessionToken as string);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          logger.warn("Session refresh failed — request continues unaffected", {
            error: message,
          });
        }
      }
    }

    return {
      currentUser: currentUser as typeof currentUser,
      // convenience helpers available in every handler
      signIn: async (userId: number) => {
        const t = await createSession(userId);
        setSessionCookie(set, t);
      },
      signOut: async () => {
        if (sessionToken) await revokeSession(sessionToken);
        clearSessionCookie(set);
      },
    };
  },
);

// ── Guards ──────────────────────────────────────────────────────

export async function requireAuth({ currentUser }: { currentUser: any }) {
  if (!currentUser) throw new Unauthorized();
}

export function requireRole(...roles: string[]) {
  return async ({ currentUser }: { currentUser: any }) => {
    if (!currentUser) throw new Unauthorized();
    if (!roles.includes(currentUser.role)) throw new Forbidden();
  };
}
