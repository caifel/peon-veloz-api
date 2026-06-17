/**
 * Lichess OAuth with PKCE — no client_secret required (deprecated since 2021).
 *
 * Authorization: GET  https://lichess.org/oauth
 * Token endpoint: POST https://lichess.org/api/token
 * User info:      GET  https://lichess.org/api/account
 */

import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema";

const LICHESS_CLIENT_ID = process.env.LICHESS_CLIENT_ID ?? "peonveloz";
const LICHESS_AUTH = "https://lichess.org/oauth";
const LICHESS_TOKEN = "https://lichess.org/api/token";
const LICHESS_ACCOUNT = "https://lichess.org/api/account";

// ── PKCE helpers ──────────────────────────────────────────────────

function base64url(buf: ArrayBuffer): string {
  return Buffer.from(buf).toString("base64url");
}

export function generateCodeVerifier(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64url(bytes);
}

export async function computeCodeChallenge(verifier: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(hash);
}

export function generateState(): string {
  return crypto.randomUUID();
}

// ── Lichess API calls ────────────────────────────────────────────

export interface LichessTokenResponse {
  access_token: string;
  token_type: "Bearer";
}

export interface LichessAccount {
  id: string;
  username: string;
  email?: string;
}

export function buildAuthUrl(challenge: string, state: string, redirectUri: string): string {
  const url = new URL(LICHESS_AUTH);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", LICHESS_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "email:read");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeCode(
  code: string,
  verifier: string,
  redirectUri: string,
): Promise<LichessTokenResponse> {
  const res = await fetch(LICHESS_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      client_id: LICHESS_CLIENT_ID,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "<no body>");
    throw new Error(`Lichess token exchange failed (${res.status}): ${body}`);
  }

  return res.json();
}

export async function getLichessAccount(accessToken: string): Promise<LichessAccount> {
  const res = await fetch(LICHESS_ACCOUNT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "<no body>");
    throw new Error(`Lichess account fetch failed (${res.status}): ${body}`);
  }

  return res.json();
}

/**
 * Derive the OAuth callback URL from the incoming request.
 * Supports reverse proxies via X-Forwarded-Proto / X-Forwarded-Host headers.
 */
export function deriveRedirectUri(request: Request): string {
  const proto = request.headers.get("X-Forwarded-Proto") ?? "http";
  const host = request.headers.get("X-Forwarded-Host") ?? request.headers.get("Host") ?? "localhost";
  return `${proto}://${host}/api/auth/lichess/callback`;
}

// ── User management ─────────────────────────────────────────────

/**
 * Find an existing user by Lichess ID, or create one.
 * Returns the user id and whether the profile still needs completion.
 */
export async function findOrCreateUser(account: LichessAccount): Promise<{
  userId: number;
  needsProfile: boolean;
}> {
  const [existing] = await db
    .select({ id: users.id, lastName: users.lastName })
    .from(users)
    .where(eq(users.lichessId, account.id))
    .limit(1);

  if (existing) {
    // Sync Lichess data that may have changed
    // email ?? undefined → drizzle leaves the column untouched if undefined
    await db
      .update(users)
      .set({
        lichessUsername: account.username,
        email: account.email ?? undefined,
      })
      .where(eq(users.id, existing.id));

    // New users are created with lastName="" — empty means incomplete profile
    return { userId: existing.id, needsProfile: !existing.lastName };
  }

  // First login — placeholder profile, user must complete it via /auth/complete-profile
  const [created] = await db
    .insert(users)
    .values({
      lichessId: account.id,
      lichessUsername: account.username,
      email: account.email ?? null,
      firstName: account.username,
      lastName: "",
      role: account.username === "caifel" ? "admin" : "member",
      phone: "",
      isActive: true,
    })
    .returning({ id: users.id });

  return { userId: created.id, needsProfile: true };
}
