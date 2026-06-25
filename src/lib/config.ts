import { loadApiDatabaseConfig } from "./db-config";

type NodeEnv = "development" | "test" | "production";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function integer(name: string, value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid environment variable ${name}: expected a positive integer`);
  }
  return parsed;
}

function nodeEnv(value: string): NodeEnv {
  if (value === "development" || value === "test" || value === "production") {
    return value;
  }
  throw new Error(`Invalid NODE_ENV: ${value}`);
}

function absoluteUrl(name: string, value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    throw new Error(`Invalid environment variable ${name}: expected an absolute URL`);
  }
}

function originList(name: string, value: string): string {
  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => absoluteUrl(name, origin));

  if (origins.length === 0) {
    throw new Error(`Invalid environment variable ${name}: expected at least one origin`);
  }

  return origins.join(",");
}

export function loadApiRuntimeConfig() {
  return {
    nodeEnv: nodeEnv(optional("NODE_ENV", "development")),
    host: required("HOST"),
    port: integer("PORT", required("PORT")),
    frontendUrl: originList("FRONTEND_URL", required("FRONTEND_URL")),
    publicUrl: absoluteUrl("PUBLIC_URL", optional("PUBLIC_URL", "http://localhost:5173")),
    csrfSecret: required("CSRF_SECRET"),
    tokenSigningKey: required("TOKEN_SIGNING_KEY"),
    redisUrl: optional("REDIS_URL", "redis://localhost:6379"),
    database: loadApiDatabaseConfig(),
  };
}

export const apiConfig = loadApiRuntimeConfig();


