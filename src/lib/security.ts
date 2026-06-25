import { Forbidden } from "./errors";
import { verifyCsrfToken } from "./csrf";
import { COOKIE_NAME } from "./auth";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const CSRF_EXEMPT_PATHS = new Set(["/api/auth/logout", "/api/webhook-meta"]);

export function parseAllowedOrigins(value: string) {
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function assertAllowedMutationOrigin(request: Request, allowedOrigins: string[]) {
  if (SAFE_METHODS.has(request.method)) return;

  const origin = request.headers.get("origin");
  if (origin) {
    if (!allowedOrigins.includes(origin)) {
      throw new Forbidden("Invalid request origin");
    }
    return;
  }

  const referer = request.headers.get("referer");
  if (!referer) return;

  try {
    const refererOrigin = new URL(referer).origin;
    if (!allowedOrigins.includes(refererOrigin)) {
      throw new Forbidden("Invalid request origin");
    }
  } catch {
    throw new Forbidden("Invalid request origin");
  }
}

/**
 * For all mutations, verify the X-CSRF-Token header matches the user's session.
 * Skips login/logout (no pre-existing CSRF token), safe methods, and Swagger.
 */
export async function assertCsrfToken(
  request: Request,
  path: string,
  cookie: Record<string, { value?: string } | undefined>,
): Promise<void> {
  if (SAFE_METHODS.has(request.method)) return;
  if (CSRF_EXEMPT_PATHS.has(path) || path.startsWith("/swagger")) return;

  const sessionToken = cookie[COOKIE_NAME]?.value;
  if (!sessionToken) return; // will be caught by auth guard

  const csrfHeader = request.headers.get("X-CSRF-Token");
  if (!csrfHeader) {
    throw new Forbidden("Missing CSRF token");
  }

  const sessionTokenHash = Bun.SHA256.hash(sessionToken, "hex");
  await verifyCsrfToken(csrfHeader, sessionTokenHash);
}
