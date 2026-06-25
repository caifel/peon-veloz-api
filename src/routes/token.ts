import { Elysia } from "elysia";
import { verifyToken, RegisterToken, CheckoutToken } from "../lib/whatsapp/tokens";

export const tokenRoutes = new Elysia({ name: "token" })

  .get(
    "/api/register/:token",
    async ({ params, set }) => {
      const payload = verifyToken<RegisterToken>(params.token, "register");
      if (!payload) {
        set.status = 401;
        return { error: "Invalid or expired registration token" };
      }

      return {
        phone: payload.phone,
        tournament: payload.tournament,
      };
    },
    {
      detail: {
        tags: ["WhatsApp"],
        summary: "Verificar token de registro",
        description:
          "Valida y decodifica un token de registro. Retorna teléfono y torneo.",
      },
    },
  )

  .get(
    "/api/checkout/:token",
    async ({ params, set }) => {
      const payload = verifyToken<CheckoutToken>(params.token, "checkout");
      if (!payload) {
        set.status = 401;
        return { error: "Invalid or expired checkout token" };
      }

      return {
        phone: payload.phone,
        tournament: payload.tournament,
        firstName: payload.firstName,
      };
    },
    {
      detail: {
        tags: ["WhatsApp"],
        summary: "Verificar token de checkout",
        description:
          "Valida y decodifica un token de checkout. Retorna teléfono, torneo y nombre.",
      },
    },
  );
