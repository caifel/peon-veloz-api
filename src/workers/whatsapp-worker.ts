import Redis from "ioredis";
import { dequeueJob, requeueOrBury, MAX_ATTEMPTS, WhatsAppJob } from "../lib/whatsapp/queue";
import { sendCtaUrlMessage, sendTextMessage } from "../lib/whatsapp/sender";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const BLOCK_TIMEOUT_SECONDS = 5;

async function sendJob(job: WhatsAppJob): Promise<void> {
  if (job.response.type === "cta_url") {
    await sendCtaUrlMessage(
      job.to,
      job.response.bodyText,
      job.response.buttonText,
      job.response.url,
    );
  } else {
    await sendTextMessage(job.to, job.response.body);
  }
}

async function processJob(redis: Redis): Promise<void> {
  const job = await dequeueJob(redis, BLOCK_TIMEOUT_SECONDS);
  if (!job) return;

  try {
    console.log(
      `[WHATSAPP-WORKER] Procesando (intento ${job.attempts + 1}/${MAX_ATTEMPTS}): ` +
        `${job.trigger} → ${job.to}`,
    );
    await sendJob(job);
    console.log(`[WHATSAPP-WORKER] Completado: ${job.trigger} → ${job.to}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const nextAttempt = job.attempts + 1;

    await requeueOrBury(redis, job, message);

    if (nextAttempt < MAX_ATTEMPTS) {
      console.log(
        `[WHATSAPP-WORKER] Reintento ${nextAttempt}/${MAX_ATTEMPTS} ` +
          `— ${job.trigger} → ${job.to} — error: ${message}`,
      );
    } else {
      console.error(
        `[WHATSAPP-WORKER] MUERTO tras ${MAX_ATTEMPTS} intentos — ` +
          `${job.trigger} → ${job.to} — error: ${message}`,
      );
    }
  }
}

async function main(): Promise<void> {
  const redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    retryStrategy(times) {
      const delay = Math.min(times * 500, 5000);
      console.log(
        `[WHATSAPP-WORKER] Reconectando Redis en ${delay}ms (intento ${times})`,
      );
      return delay;
    },
  });

  redis.on("connect", () => {
    console.log("[WHATSAPP-WORKER] Conectado a Redis — esperando jobs...");
  });

  redis.on("error", (err) => {
    console.error("[WHATSAPP-WORKER] Error de Redis:", err.message);
  });

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("\n[WHATSAPP-WORKER] Cerrando gracefulmente...");
    redis.disconnect();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  while (!shuttingDown) {
    await processJob(redis);
  }
}

main();
