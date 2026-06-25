import { createHmac } from "node:crypto";
import { apiConfig } from "../config";

const HEADER_B64 = Buffer.from(
  JSON.stringify({ alg: "HS256", typ: "JWT" }),
).toString("base64url");

export interface RegisterToken {
  action: "register";
  phone: string;
  tournament: string;
  iat: number;
  exp: number;
}

export interface CheckoutToken {
  action: "checkout";
  phone: string;
  tournament: string;
  firstName: string;
  iat: number;
  exp: number;
}

type TokenPayload = RegisterToken | CheckoutToken;

function sign(data: string): string {
  return createHmac("sha256", apiConfig.tokenSigningKey)
    .update(data)
    .digest("base64url");
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}

export function createRegisterToken(
  phone: string,
  tournament: string,
): string {
  const payload: RegisterToken = {
    action: "register",
    phone,
    tournament,
    iat: now(),
    exp: now() + 600, // 10 minutes
  };

  return createJwt(payload);
}

export function createCheckoutToken(
  phone: string,
  tournament: string,
  firstName: string,
): string {
  const payload: CheckoutToken = {
    action: "checkout",
    phone,
    tournament,
    firstName,
    iat: now(),
    exp: now() + 300, // 5 minutes
  };

  return createJwt(payload);
}

function createJwt(payload: TokenPayload): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  const signature = sign(`${HEADER_B64}.${payloadB64}`);
  return `${HEADER_B64}.${payloadB64}.${signature}`;
}

export function verifyToken<T extends TokenPayload>(
  token: string,
  expectedAction: T["action"],
): T | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signature] = parts;

  // Validate header
  if (headerB64 !== HEADER_B64) return null;

  // Verify signature
  const expected = sign(`${headerB64}.${payloadB64}`);
  if (signature !== expected) return null;

  // Decode payload
  let payload: T;
  try {
    payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString(),
    ) as T;
  } catch {
    return null;
  }

  // Validate action
  if (payload.action !== expectedAction) return null;

  // Validate expiration
  if (payload.exp < now()) return null;

  return payload;
}
