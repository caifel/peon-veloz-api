import { Elysia, t } from "elysia";
import { appendFileSync } from "node:fs";
import { Unauthorized } from "../lib/errors";

const NOTIFICATIONS_FILE = `${process.cwd()}/notifications.txt`;
const EXPECTED_API_KEY = process.env.PUSH_NOTIFICATION_API_KEY ?? "";

export const pushNotificationRoutes = new Elysia()
  .post(
    "/api/push-notification",
    async ({ body, request }) => {
      const apiKey = request.headers.get("X-API-Key");
      if (!EXPECTED_API_KEY || apiKey !== EXPECTED_API_KEY) {
        throw new Unauthorized("API key inválida");
      }

      const line = JSON.stringify({ ...body, receivedAt: new Date().toISOString() }) + "\n";
      appendFileSync(NOTIFICATIONS_FILE, line);

      return { ok: true };
    },
    {
      body: t.Object({
        app: t.String(),
        title: t.String(),
        text: t.String(),
        lines: t.Optional(t.Any()),
        timestamp: t.Number(),
        notification_id: t.Optional(t.Any()),
      }, { additionalProperties: true }),
      detail: {
        tags: ["Push Notification"],
        summary: "Recibir notificación Yape",
        description: "Recibe el texto de una notificación de Yape y lo guarda en disco.",
      },
    },
  );
