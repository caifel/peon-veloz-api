import { Elysia } from "elysia";
import { VERIFY_TOKEN } from "../lib/whatsapp/config";
import { verifySignature } from "../lib/whatsapp/security";
import { processWebhookPayload } from "../lib/whatsapp/dispatcher";

export const webhookMetaRoutes = new Elysia({ name: "webhook-meta" })

  // GET — Handshake inicial (Meta activa el webhook una sola vez)
  .get(
    "/api/webhook-meta",
    async ({ query }) => {
      const mode = query["hub.mode"];
      const token = query["hub.verify_token"];
      const challenge = query["hub.challenge"];

      if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
        return new Response(challenge, { status: 200 });
      }

      return new Response("Verification failed", { status: 403 });
    },
    {
      detail: {
        tags: ["WhatsApp"],
        summary: "Webhook Meta — handshake",
        description:
          "Meta envía hub.verify_token y hub.challenge. Se verifica y se responde.",
      },
    },
  )

  // POST — Recepción de mensajes y estados
  .post(
    "/api/webhook-meta",
    async ({ request }) => {
      // 1. Leer body crudo
      const rawBody = await request.text();

      // 2. Verificar firma (si Meta la envió)
      const signatureHeader = request.headers.get("X-Hub-Signature-256");
      if (signatureHeader) {
        if (!verifySignature(rawBody, signatureHeader)) {
          return new Response("Invalid signature", { status: 403 });
        }
      }

      // 3. Parsear JSON
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(rawBody);
      } catch {
        return new Response("EVENT_RECEIVED", { status: 200 });
      }

      // 4. Procesar: loguea en consola + dispara respuestas en background
      processWebhookPayload(body);

      // 5. Responder 200 inmediato
      return new Response("EVENT_RECEIVED", { status: 200 });
    },
    {
      detail: {
        tags: ["WhatsApp"],
        summary: "Webhook Meta — recibir eventos",
        description:
          "Recibe mensajes y estados de WhatsApp. Responde 200 de inmediato.",
      },
    },
  );
