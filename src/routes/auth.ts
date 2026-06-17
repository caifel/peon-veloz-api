import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { Unauthorized, BadRequest } from "../lib/errors";
import { authPlugin, COOKIE_NAME } from "../lib/auth";
import { generateCsrfToken } from "../lib/csrf";
import { ok } from "../lib/response";
import { db } from "../db/client";
import { users } from "../db/schema";
import { DataResponse, UserRoleEnum, ErrorResponse } from "../lib/schemas";
import { getRedis } from "../lib/redis";
import {
  generateCodeVerifier,
  computeCodeChallenge,
  generateState,
  buildAuthUrl,
  exchangeCode,
  getLichessAccount,
  deriveRedirectUri,
  findOrCreateUser,
} from "../lib/lichess-oauth";

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
    async ({ query, request, signIn }) => {
      const { code, state } = query as { code?: string; state?: string };
      if (!code || !state) throw new BadRequest("Missing code or state");

      const redis = getRedis();
      if (!redis) throw new BadRequest("Service temporarily unavailable");
      const codeVerifier = await redis.getdel(`lichess_oauth:${state}`);
      if (!codeVerifier) throw new BadRequest("OAuth session expired — please try again");

      const { access_token } = await exchangeCode(code, codeVerifier, deriveRedirectUri(request));
      const account = await getLichessAccount(access_token);
      const { userId, needsProfile } = await findOrCreateUser(account);

      await signIn(userId);

      const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";
      const target = needsProfile ? "/complete-profile" : "/";
      return new Response(null, { status: 302, headers: { Location: `${frontendUrl}${target}` } });
    },
    {
      detail: { tags: TAG, summary: "Lichess OAuth — callback" },
    },
  )

  // ── POST /auth/complete-profile ───────────────────────────────
  .post(
    "/complete-profile",
    async ({ body, currentUser }) => {
      if (!currentUser) throw new Unauthorized();
      await db.update(users)
        .set({
          firstName: body.firstName,
          lastName: body.lastName,
          phone: body.phone,
          birthDate: body.birthDate ? new Date(body.birthDate) : undefined,
          gender: body.gender ?? undefined,
        })
        .where(eq(users.id, currentUser.id));
      return ok({ message: "Profile updated" });
    },
    {
      body: t.Object({
        firstName: t.String({ minLength: 1 }),
        lastName: t.String({ minLength: 1 }),
        phone: t.String({ minLength: 1 }),
        birthDate: t.Optional(t.String()),
        gender: t.Optional(t.String()),
      }),
      detail: { tags: TAG, summary: "Complete profile after first Lichess login" },
      response: { 200: DataResponse(t.Object({ message: t.String() })), 401: ErrorResponse },
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
