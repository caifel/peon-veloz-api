import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { Unauthorized, BadRequest, Conflict } from "../lib/errors";
import { authPlugin, COOKIE_NAME } from "../lib/auth";
import { generateCsrfToken } from "../lib/csrf";
import { ok, created } from "../lib/response";
import { apiConfig } from "../lib/config";
import { db } from "../db/client";
import { users } from "../db/schema";
import { DataResponse, UserRoleEnum, ErrorResponse, validateBirthDate } from "../lib/schemas";
import { getRedis } from "../lib/redis";
import {
  generateCodeVerifier,
  computeCodeChallenge,
  generateState,
  buildAuthUrl,
  exchangeCode,
  getLichessAccount,
  deriveRedirectUri,
} from "../lib/lichess-oauth";
import { verifyToken, type RegisterToken } from "../lib/whatsapp/tokens";

const TAG = ["Auth"];
const OAUTH_TTL = 600;

export const authRoutes = new Elysia({ prefix: "/api/auth" })
  .use(authPlugin)

  // ── GET /auth/lichess ─────────────────────────────────────────
  .get(
    "/lichess",
    async ({ request }) => {
      const verifier = generateCodeVerifier();
      const challenge = await computeCodeChallenge(verifier);
      const state = generateState();

      const redis = getRedis();
      if (!redis) throw new BadRequest("Service temporarily unavailable — try again");
      await redis.setex(`lichess_oauth:${state}`, OAUTH_TTL, verifier);

      const url = buildAuthUrl(challenge, state, deriveRedirectUri(request));
      return new Response(null, { status: 302, headers: { Location: url } });
    },
    {
      detail: { tags: TAG, summary: "Lichess OAuth — step 1" },
    },
  )

  // ── GET /auth/lichess/callback ────────────────────────────────
  .get(
    "/lichess/callback",
    async ({ query, request }) => {
      const { code, state } = query as { code?: string; state?: string };
      if (!code || !state) throw new BadRequest("Missing code or state");

      const redis = getRedis();
      if (!redis) throw new BadRequest("Service temporarily unavailable");
      const codeVerifier = await redis.getdel(`lichess_oauth:${state}`);
      if (!codeVerifier) throw new BadRequest("OAuth session expired — please try again");

      const { access_token } = await exchangeCode(code, codeVerifier, deriveRedirectUri(request));
      const account = await getLichessAccount(access_token);

      // ── Redirect al frontend con datos de Lichess ──
      // El frontend tiene /lichess-callback como puente BroadcastChannel hacia /register.
      // No se crea usuario ni sesión acá — solo se entrega la identidad.
      const games = account.count?.all ?? 0;
      const params = new URLSearchParams({
        lichessId: account.id,
        lichessUsername: account.username,
        email: account.email ?? "",
        isClean: String(!account.tosViolation),
        isEstablished: String(games >= 100),
      });

      return new Response(null, {
        status: 302,
        headers: { Location: `${apiConfig.publicUrl}/lichess-callback?${params}` },
      });
    },
    {
      detail: { tags: TAG, summary: "Lichess OAuth — callback" },
    },
  )

  // ── POST /auth/register ─────────────────────────────────────
  .post(
    "/register",
    async ({ body, set }) => {
      const token = verifyToken<RegisterToken>(body.token, "register");
      if (!token) throw new BadRequest("Invalid or expired register token");

      // Validate birthDate
      const dateError = validateBirthDate(body.birthDate);
      if (dateError !== true) throw new BadRequest(dateError);

      // Phone duplicate check
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.phone, token.phone))
        .limit(1);
      if (existing) throw new Conflict("Phone already registered");

      await db.insert(users).values({
        lichessId: body.lichessId,
        lichessUsername: body.lichessUsername,
        email: body.email || null,
        firstName: body.firstName,
        lastName: body.lastName,
        stateName: body.stateName,
        birthDate: body.birthDate,
        phone: token.phone,
        role: "member",
        isActive: true,
      });

      return created({ message: "User registered" }, set);
    },
    {
      body: t.Object({
        token: t.String(),
        lichessId: t.String(),
        lichessUsername: t.String(),
        email: t.Optional(t.String()),
        firstName: t.String({ minLength: 1 }),
        lastName: t.String({ minLength: 1 }),
        stateName: t.String({ minLength: 1 }),
        birthDate: t.String(),
      }),
      detail: { tags: TAG, summary: "Register user after Lichess OAuth" },
      response: { 201: DataResponse(t.Object({ message: t.String() })) },
    },
  )

  // ── POST /auth/logout ─────────────────────────────────────────
  .post("/logout",
    async ({ signOut }) => {
      await signOut();
      return ok({ message: "Logged out" });
    },
    {
      detail: { tags: TAG, summary: "Logout (clear session cookie)" },
      response: { 200: DataResponse(t.Object({ message: t.String() })), 403: ErrorResponse },
    },
  )

  // ── GET /auth/me ──────────────────────────────────────────────
  .get("/me",
    async ({ currentUser }) => {
      if (!currentUser) throw new Unauthorized();
      return ok({
        id: currentUser.id,
        email: currentUser.email,
        lichessUsername: currentUser.lichessUsername,
        firstName: currentUser.firstName,
        lastName: currentUser.lastName,
        role: currentUser.role,
      });
    },
    {
      detail: { tags: TAG, summary: "Get current authenticated user" },
      response: {
        200: DataResponse(t.Object({
          id: t.Number(), email: t.Nullable(t.String()), lichessUsername: t.Nullable(t.String()),
          firstName: t.String(), lastName: t.String(), role: UserRoleEnum,
        })),
        401: ErrorResponse,
      },
    },
  )

  // ── GET /auth/csrf-token ──────────────────────────────────────
  .get("/csrf-token",
    async ({ cookie, currentUser }) => {
      if (!currentUser) throw new Unauthorized();
      const token = (cookie as Record<string, { value?: string } | undefined>)[COOKIE_NAME]?.value;
      if (!token) throw new Unauthorized("No session cookie");
      return ok({ token: await generateCsrfToken(Bun.SHA256.hash(token, "hex")) });
    },
    {
      detail: { tags: TAG, summary: "Get CSRF token for the current session" },
      response: { 200: DataResponse(t.Object({ token: t.String() })), 401: ErrorResponse },
    },
  );
