import { and, eq } from "drizzle-orm";
import { logIncomingMessage } from "./logger";
import { enqueueJob } from "./queue";
import { createRegisterToken, createCheckoutToken } from "./tokens";
import { db } from "../../db/client";
import { tournaments, users } from "../../db/schema";
import { apiConfig } from "../../lib/config";

/**
 * Toma la última palabra del mensaje y la busca como slug de torneo activo.
 * Luego verifica si el número de WhatsApp ya está registrado.
 * - Torneo no encontrado → "no disponible"
 * - Usuario nuevo       → CTA de registro con token
 * - Usuario existente    → CTA de checkout con token
 */
async function dispatchResponse(value: Record<string, unknown>): Promise<void> {
  const messages = value?.messages as Record<string, unknown>[] | undefined;
  if (!messages || !Array.isArray(messages)) return;

  for (const msg of messages) {
    const type = msg.type as string | undefined;
    if (type !== "text") continue;

    const from = msg.from as string | undefined;
    const text = msg.text as Record<string, unknown> | undefined;
    const body = text?.body as string | undefined;

    if (!from || !body) continue;

    const keyword = body.trim().split(" ").pop()?.toLowerCase();
    if (!keyword) continue;

    const tournament = db
      .select({ name: tournaments.name, slug: tournaments.slug })
      .from(tournaments)
      .where(and(eq(tournaments.slug, keyword), eq(tournaments.isActive, true)))
      .get();

    if (!tournament) {
      await enqueueJob(from, "unknown", {
        type: "text",
        body: "Ese torneo no está disponible en este momento.",
      });
      continue;
    }

    const user = db
      .select({ firstName: users.firstName })
      .from(users)
      .where(eq(users.phone, from))
      .get();

    if (user) {
      const token = createCheckoutToken(from, tournament.slug!, user.firstName);
      await enqueueJob(from, tournament.slug!, {
        type: "cta_url",
        bodyText: `¡Hola ${user.firstName}! ${tournament.name}. Completá tu inscripción`,
        buttonText: "Realizar pago",
        url: `${apiConfig.publicUrl}/checkout/${token}`,
      });
    } else {
      const token = createRegisterToken(from, tournament.slug!);
      await enqueueJob(from, tournament.slug!, {
        type: "cta_url",
        bodyText: "Bienvenido. Por favor antes de proceder debes completar tu registro",
        buttonText: "Registro de usuario",
        url: `${apiConfig.publicUrl}/register/${token}`,
      });
    }
  }
}

/**
 * Extrae todos los bloques "value" de un payload de Meta y los procesa.
 * - logIncomingMessage: síncrono, imprime en consola.
 * - dispatchResponse: fire-and-forget, no bloquea el 200.
 */
export function processWebhookPayload(body: Record<string, unknown>): void {
  const entryList = body.entry as Record<string, unknown>[] | undefined;

  if (entryList && Array.isArray(entryList)) {
    for (const entry of entryList) {
      const changes = entry?.changes as Record<string, unknown>[] | undefined;
      if (!changes || !Array.isArray(changes)) continue;

      for (const change of changes) {
        const value = change?.value as Record<string, unknown> | undefined;
        if (!value) continue;

        logIncomingMessage(value);
        void dispatchResponse(value);
      }
    }
  } else if (body.value) {
    const value = body.value as Record<string, unknown>;
    logIncomingMessage(value);
    void dispatchResponse(value);
  }
}
