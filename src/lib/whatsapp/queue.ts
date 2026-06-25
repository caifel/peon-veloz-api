const QUEUE_KEY = "whatsapp:queue";
const DEAD_KEY = "whatsapp:dead";
const MAX_ATTEMPTS = 3;

export interface WhatsAppJob {
  to: string;
  trigger: string;
  attempts: number;
  createdAt: string;
  /** Lo que el worker debe enviar. Lo construye el dispatcher al encolar. */
  response: CtaResponse | TextResponse;
}

export interface CtaResponse {
  type: "cta_url";
  bodyText: string;
  buttonText: string;
  url: string;
}

export interface TextResponse {
  type: "text";
  body: string;
}

// ── Lado API (webhook) ──────────────────────────────────────────────

/** Encola un job para que el worker lo procese. Deduplica por to+trigger en ventana de 30s. Si Redis no está disponible, loguea y sigue (fail-open). */
export async function enqueueJob(
  to: string,
  trigger: string,
  response: CtaResponse | TextResponse,
): Promise<void> {
  const { getRedis } = await import("../redis");

  const redis = getRedis();
  if (!redis) {
    console.error(
      `[WHATSAPP-QUEUE] Redis no disponible — job perdido: ${trigger} → ${to}`,
    );
    return;
  }

  // Dedup: mismo usuario + mismo trigger en <30s → ignorar
  const dedupKey = `whatsapp:dedup:${to}:${trigger}`;
  const isNew = await redis.set(dedupKey, "1", "EX", 30, "NX");
  if (!isNew) {
    console.log(`[WHATSAPP-QUEUE] Duplicado ignorado: ${trigger} → ${to}`);
    return;
  }

  const job: WhatsAppJob = {
    to,
    trigger,
    response,
    attempts: 0,
    createdAt: new Date().toISOString(),
  };

  await redis.lpush(QUEUE_KEY, JSON.stringify(job));
  console.log(`[WHATSAPP-QUEUE] Encolado: ${trigger} → ${to}`);
}

// ── Lado worker ─────────────────────────────────────────────────────

/** Bloquea con BRPOP hasta que haya un job. Retorna null si el timeout se vence sin jobs. */
export async function dequeueJob(
  redis: import("ioredis").default,
  timeoutSeconds: number,
): Promise<WhatsAppJob | null> {
  const result = await redis.brpop(QUEUE_KEY, timeoutSeconds);
  if (!result) return null;
  return JSON.parse(result[1]) as WhatsAppJob;
}

/** Re-encola un job si aún tiene intentos, o lo entierra en la dead letter queue. Sin logs — el caller decide qué comunicar. */
export async function requeueOrBury(
  redis: import("ioredis").default,
  job: WhatsAppJob,
  error: string,
): Promise<void> {
  const nextAttempt = job.attempts + 1;

  if (nextAttempt < MAX_ATTEMPTS) {
    const retryJob: WhatsAppJob = { ...job, attempts: nextAttempt };
    await redis.lpush(QUEUE_KEY, JSON.stringify(retryJob));
  } else {
    await redis.lpush(DEAD_KEY, JSON.stringify({ ...job, error }));
  }
}

export { QUEUE_KEY, DEAD_KEY, MAX_ATTEMPTS };
