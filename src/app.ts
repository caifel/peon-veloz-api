import { Elysia, t } from "elysia";
import { sql } from "drizzle-orm";
import { swagger } from "@elysiajs/swagger";
import { staticPlugin } from "@elysiajs/static";

import { db } from "./db/client";
import { apiConfig } from "./lib/config";
import { connectRedis } from "./lib/redis";
import { errorHandler, Unauthorized } from "./lib/errors";
import { authPlugin } from "./lib/auth";
import { logger } from "./lib/logger";
import { assertAllowedMutationOrigin, parseAllowedOrigins, assertCsrfToken } from "./lib/security";
import {
  beginRequest,
  getRequestDurationMs,
  getRequestPath,
} from "./lib/request-context";
import { normalizeDates } from "./lib/schemas";

import { authRoutes } from "./routes/auth";
import { usersRoutes } from "./routes/users";
import { tournamentsRoutes } from "./routes/tournaments";
import { pushNotificationRoutes } from "./routes/push-notification";
import { webhookMetaRoutes } from "./routes/webhook-meta";
import { tokenRoutes } from "./routes/token";

const ALLOWED_ORIGINS = parseAllowedOrigins(apiConfig.frontendUrl);

export const app = new Elysia()

  // ── CORS + preflight ─────────────────────────────────────────
  .onRequest(({ request, set }) => {
    beginRequest(request);

    const origin = request.headers.get("origin") ?? "";
    if (ALLOWED_ORIGINS.includes(origin)) {
      (set.headers as Record<string, string>)["Access-Control-Allow-Origin"] = origin;
      (set.headers as Record<string, string>)["Access-Control-Allow-Credentials"] = "true";
      (set.headers as Record<string, string>)["Access-Control-Allow-Methods"] =
        "GET, POST, PUT, PATCH, DELETE, OPTIONS";
      (set.headers as Record<string, string>)["Access-Control-Allow-Headers"] =
        "Content-Type, Authorization, X-CSRF-Token";
      (set.headers as Record<string, string>)["Access-Control-Max-Age"] = "86400";
    }
    if (request.method === "OPTIONS") {
      set.status = 204;
      return "";
    }
  })

  // ── Global error handling ─────────────────────────────────────
  .use(errorHandler)

  // ── OpenAPI / Swagger ─────────────────────────────────────────
  .use(
    swagger({
      path: "/swagger",
      scalarVersion: "latest",
      documentation: {
        info: {
          title: "PeonVeloz API",
          version: "1.0.51",
          description:
            "REST API for chess tournament management — users and tournaments.",
        },
        tags: [
          { name: "Health", description: "Status checks" },
          { name: "Auth", description: "Login, logout, session" },
          { name: "Users", description: "User accounts and profiles" },
          { name: "Tournaments", description: "Tournament events" },
        ],
        components: {
          schemas: {
            ErrorResponse: {
              type: "object",
              properties: {
                error: {
                  type: "object",
                  properties: {
                    code: { type: "string" },
                    message: { type: "string" },
                  },
                  required: ["code", "message"],
                },
              },
              required: ["error"],
            },
            PaginationMeta: {
              type: "object",
              properties: {
                page: { type: "integer" },
                limit: { type: "integer" },
                total: { type: "integer" },
                totalPages: { type: "integer" },
              },
              required: ["page", "limit", "total", "totalPages"],
            },
          },
        },
      },
    }),
  )

  // ── Auth plugin — derives currentUser, signIn, signOut ────────
  .use(authPlugin)

  // ── Global date normalization ──────────────────────────────────
  // Converts all Date objects in response bodies to ISO-8601 strings
  .onAfterHandle({ as: "global" }, ({ response }) => {
    if (response instanceof Response) return; // don't normalize redirect responses
    if (response && typeof response === "object") {
      return normalizeDates(response);
    }
  })

  // ── Request logging ───────────────────────────────────────────
  .onAfterResponse({ as: "global" }, ({ request, responseValue, set }) => {
    const status =
      typeof set.status === "number"
        ? set.status
        : responseValue instanceof Response
          ? responseValue.status
          : 200;

    logger.info("Request completed", {
      method: request.method,
      path: getRequestPath(request),
      status,
      durationMs: getRequestDurationMs(request),
    });
  })

  // ── Global mutation guard ─────────────────────────────────────
  // All routes require authentication except these public paths:
  //   GET  /, /health, /swagger/*
  //   GET  /api/auth/lichess, /api/auth/lichess/callback
  //   POST /api/auth/logout, /api/push-notification
  .onBeforeHandle({ as: "global" }, async ({ request, currentUser, path, cookie }) => {
    // Public paths — no auth, no origin check, no CSRF required
    if (request.method === "GET") {
      if (path === "/" || path === "/health") return;
      if (path.startsWith("/swagger")) return;
      if (path === "/api/auth/lichess" || path === "/api/auth/lichess/callback") return;
    }
    if (path === "/api/auth/logout") return;
    if (path === "/api/auth/register") return;
    if (path === "/api/push-notification") return;
    if (path === "/api/webhook-meta") return;
    if (path.startsWith("/api/register/") || path.startsWith("/api/checkout/")) return;

    assertAllowedMutationOrigin(request, ALLOWED_ORIGINS);
    await assertCsrfToken(request, path, cookie as Record<string, { value?: string } | undefined>);

    if (!currentUser) throw new Unauthorized();
  })

  // ── Root + Health ─────────────────────────────────────────────
  .get("/", () => ({ name: "PeonVeloz API", version: "1.0.51", docs: "/swagger" }), {
    detail: { tags: ["Health"], summary: "API metadata" },
  })
  .get(
    "/health",
    async ({ set }) => {
      let sqliteOk = false;
      try {
        const result = db.get<{ 1: number }>(sql`SELECT 1`);
        sqliteOk = result != null;
      } catch {
        sqliteOk = false;
      }

      const redisOk = await connectRedis();
      const status = sqliteOk ? (redisOk ? "ok" : "degraded") : "unhealthy";
      if (!sqliteOk) set.status = 503;

      return {
        status,
        dependencies: {
          sqlite: sqliteOk ? "ok" : "down",
          redis: redisOk ? "ok" : "down",
        },
      };
    },
    {
      detail: { tags: ["Health"], summary: "Dependency health check" },
      response: t.Object({
        status: t.Union([t.Literal("ok"), t.Literal("degraded"), t.Literal("unhealthy")]),
        dependencies: t.Object({
          sqlite: t.Union([t.Literal("ok"), t.Literal("down")]),
          redis: t.Union([t.Literal("ok"), t.Literal("down")]),
        }),
      }),
    },
  )

  // ── Auth routes ───────────────────────────────────────────────
  .use(authRoutes)

  // ── Resource routes ───────────────────────────────────────────
  .use(usersRoutes)
  .use(tournamentsRoutes)
  .use(pushNotificationRoutes)
  .use(webhookMetaRoutes)
  .use(tokenRoutes)

  // ── Static files + SPA fallback (production only) ───────────────
  // In production the API serves the built Vue app from ../public.
  // API routes take precedence; unmatched paths fall back to index.html
  // so Vue Router can handle client-side navigation.
  .use(
    apiConfig.nodeEnv === "production"
      ? staticPlugin({ assets: "public", prefix: "/" })
      : new Elysia(),
  )
  .get("*", ({ set }) => {
    if (apiConfig.nodeEnv !== "production") return;
    const indexHtml = Bun.file("public/index.html");
    set.headers["Content-Type"] = "text/html";
    return indexHtml;
  });

export type App = typeof app;
