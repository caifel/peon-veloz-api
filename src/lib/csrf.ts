/**
 * CSRF token helpers — HMAC-SHA256 tokens tied to the user's session.
 *
 * Token format:  base64url(payload).base64url(hmac)
 *   payload = sessionTokenHash : expiryTimestamp
 *   hmac    = HMAC-SHA256(CSRF_SECRET, payload)
 *
 * Lifespan: 1 hour (short-lived, refreshed on each GET /auth/csrf-token).
 */
import { apiConfig } from "./config";
import { Forbidden } from "./errors";

const CSRF_TTL_MS = 60 * 60 * 1000; // 1 hour

// ── Low-level HMAC helpers ───────────────────────────────────────

async function hmac(payload: string, secret: string): Promise<string> {
  // Bun.CryptoHasher for HMAC-SHA256
  const hasher = new Bun.CryptoHasher("sha256", secret);
  hasher.update(payload);
  return hasher.digest("base64url") as string;
}

function b64url(input: string): string {
  return Buffer.from(input).toString("base64url");
}

function fromB64url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Generate a CSRF token tied to a session token hash.
 * Returns the token string the client should send back in X-CSRF-Token.
 */
export async function generateCsrfToken(sessionTokenHash: string): Promise<string> {
  const expiry = Date.now() + CSRF_TTL_MS;
  const payload = b64url(`${sessionTokenHash}:${expiry}`);
  const signature = await hmac(payload, apiConfig.csrfSecret);

  return `${payload}.${signature}`;
}

/**
 * Verify a CSRF token against the user's current session token hash.
 * Throws Forbidden if invalid, expired, or mismatched.
 */
export async function verifyCsrfToken(token: string, sessionTokenHash: string): Promise<void> {
  const lastDot = token.lastIndexOf(".");
  if (lastDot === -1) throw new Forbidden("Invalid CSRF token format");

  const payload = token.slice(0, lastDot);
  const signature = token.slice(lastDot + 1);

  // 1. Verify HMAC
  const expectedSig = await hmac(payload, apiConfig.csrfSecret);
  if (!timingSafeEqual(signature, expectedSig)) {
    throw new Forbidden("Invalid CSRF token");
  }

  // 2. Decode payload
  let decoded: string;
  try {
    decoded = fromB64url(payload);
  } catch {
    throw new Forbidden("Invalid CSRF token payload");
  }

  const colonIdx = decoded.lastIndexOf(":");
  if (colonIdx === -1) throw new Forbidden("Invalid CSRF token payload");

  const tokenSessionHash = decoded.slice(0, colonIdx);
  const expiryStr = decoded.slice(colonIdx + 1);

  // 3. Verify session binding
  if (tokenSessionHash !== sessionTokenHash) {
    throw new Forbidden("CSRF token does not match session");
  }

  // 4. Verify expiry
  const expiryMs = Number(expiryStr);
  if (!Number.isFinite(expiryMs) || Date.now() > expiryMs) {
    throw new Forbidden("CSRF token expired");
  }
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
