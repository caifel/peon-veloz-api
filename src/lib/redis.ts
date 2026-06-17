/**
 * Redis client singleton — lazy-connect, fail-open with cooldown recovery.
 *
 * On connection failure rate limiting is disabled (fail-open). After a 30-second
 * cooldown the module retries — if Redis has recovered, rate limiting resumes.
 */
import Redis from "ioredis";
import { apiConfig } from "./config";
import { logger } from "./logger";

const COOLDOWN_MS = 30_000;

let redis: Redis | null = null;
let connectionFailed = false;
let cooldownTimer: ReturnType<typeof setTimeout> | null = null;

export function getRedis(): Redis | null {
  if (connectionFailed) return null;

  if (!redis) {
    redis = new Redis(apiConfig.redisUrl, {
      maxRetriesPerRequest: 0,
      lazyConnect: true,
      retryStrategy() {
        return null; // never retry — fail fast, rely on cooldown for recovery
      },
    });

    redis.on("error", (err) => {
      logger.warn("Redis connection error — rate limiting disabled", {
        error: err.message,
      });
      connectionFailed = true;
      redis = null;

      // Schedule a single recovery attempt after the cooldown
      if (cooldownTimer) clearTimeout(cooldownTimer);
      cooldownTimer = setTimeout(() => {
        connectionFailed = false;
        cooldownTimer = null;
      }, COOLDOWN_MS);
    });
  }

  return redis;
}

/**
 * Try to connect to Redis. Returns true if the connection succeeds.
 * Used by tests and by startup health checks.
 */
export async function connectRedis(): Promise<boolean> {
  const r = getRedis();
  if (!r) return false;
  try {
    if (r.status === "wait") {
      await r.connect();
    }
    await r.ping();
    return true;
  } catch {
    return false;
  }
}
