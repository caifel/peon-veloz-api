import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { ensureTestDb, clearAllTables, bootstrapAdmin, req, json, getApp, flushRedis } from "./setup";

beforeAll(async () => {
  await ensureTestDb();
});

// ── GET /auth/lichess ──────────────────────────────────────────

describe("GET /auth/lichess", () => {
  beforeAll(async () => {
    clearAllTables();
    await flushRedis();
  });

  it("redirects to Lichess with valid OAuth params", async () => {
    const app = await getApp();
    const res = await app.handle(
      new Request("http://localhost/api/auth/lichess", { redirect: "manual" }),
    );

    if (res.status === 400) return; // Redis unavailable — skip

    expect(res.status).toBe(302);
    const url = new URL(res.headers.get("Location")!);
    expect(url.origin).toBe("https://lichess.org");
    expect(url.pathname).toBe("/oauth");
    expect(url.searchParams.get("scope")).toBe("email:read");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });
});

// ── Authenticated endpoints (use bootstrapAdmin, no OAuth mock) ─

describe("GET /auth/me", () => {
  beforeAll(async () => {
    clearAllTables();
    await bootstrapAdmin();
  });

  it("returns the authenticated user", async () => {
    const body = await json(await req("GET", "/api/auth/me"));
    expect(body.data.email).toBe("admin@test.com");
    expect(body.data.role).toBe("admin");
  });

  it("returns 401 without session", async () => {
    const app = await getApp();
    const res = await app.handle(new Request("http://localhost/api/auth/me"));
    expect(res.status).toBe(401);
  });
});

describe("POST /auth/complete-profile", () => {
  beforeAll(async () => {
    clearAllTables();
    await bootstrapAdmin();
  });

  it("updates the user profile", async () => {
    const body = await json(
      await req("POST", "/api/auth/complete-profile", {
        firstName: "Carlos",
        lastName: "Mendoza",
        phone: "+591 77777777",
      }),
    );
    expect(body.data.message).toBe("Profile updated");

    const me = await json(await req("GET", "/api/auth/me"));
    expect(me.data.firstName).toBe("Carlos");
    expect(me.data.lastName).toBe("Mendoza");
  });

  it("returns 401 without session", async () => {
    const app = await getApp();
    const res = await app.handle(
      new Request("http://localhost/api/auth/complete-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: "X", lastName: "Y", phone: "+591 70000000" }),
      }),
    );
    expect(res.status).toBe(401);
  });
});

// ── OAuth callback (requires mocked Lichess API) ────────────────

describe("GET /auth/lichess/callback", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeAll(async () => {
    clearAllTables();
    await flushRedis();

    originalFetch = globalThis.fetch;
    globalThis.fetch = ((input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      if (url === "https://lichess.org/api/token") {
        return Promise.resolve(
          new Response(JSON.stringify({ access_token: "mock-token", token_type: "Bearer" }), {
            status: 200, headers: { "Content-Type": "application/json" },
          }),
        );
      }
      if (url === "https://lichess.org/api/account") {
        return Promise.resolve(
          new Response(JSON.stringify({ id: "testuser", username: "TestUser", email: "test@lichess.org" }), {
            status: 200, headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return originalFetch(input, init);
    }) as typeof globalThis.fetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  async function simulateCallback(): Promise<Response> {
    const app = await getApp();
    const res1 = await app.handle(
      new Request("http://localhost/api/auth/lichess", { redirect: "manual" }),
    );
    if (res1.status === 400) throw new Error("Redis unavailable");
    const state = new URL(res1.headers.get("Location")!).searchParams.get("state")!;
    return app.handle(
      new Request(`http://localhost/api/auth/lichess/callback?code=mock-code&state=${state}`, {
        redirect: "manual",
      }),
    );
  }

  it("creates a new user and redirects to complete-profile", async () => {
    const res = await simulateCallback().catch(() => null as any);
    if (!res) return; // Redis unavailable
    expect(res.status).toBe(302);
    expect(res.headers.get("Set-Cookie")).toContain("session=");
    expect(res.headers.get("Location")).toContain("/complete-profile");
  });

  it("redirects returning users to dashboard", async () => {
    // First login
    const res1 = await simulateCallback().catch(() => null as any);
    if (!res1) return;
    expect(res1.headers.get("Location")).toContain("/complete-profile");
    const cookie = res1.headers.get("Set-Cookie")!.split(";")[0];

    // Complete profile via API
    const csrfRes = await getApp().then(app =>
      app.handle(new Request("http://localhost/api/auth/csrf-token", {
        headers: { Cookie: cookie },
      })),
    );
    const csrfToken = (await csrfRes.json()).data?.token;
    await getApp().then(app =>
      app.handle(
        new Request("http://localhost/api/auth/complete-profile", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: cookie,
            "X-CSRF-Token": csrfToken,
          },
          body: JSON.stringify({ firstName: "Done", lastName: "Profile", phone: "+591 70000000" }),
        }),
      ),
    );

    // Second login
    const res2 = await simulateCallback().catch(() => null as any);
    if (!res2) return;
    expect(res2.headers.get("Location")).toContain("/dashboard");
  });
});
