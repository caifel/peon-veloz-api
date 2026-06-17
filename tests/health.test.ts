import { beforeAll, describe, expect, it } from "bun:test";

import { ensureTestDb, getApp } from "./setup";

beforeAll(async () => {
  await ensureTestDb();
});

describe("GET /health", () => {
  it("reports SQLite and Redis dependency status", async () => {
    const app = await getApp();
    const res = await app.handle(new Request("http://localhost/health"));

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.dependencies.sqlite).toBe("ok");
    expect(body.dependencies.redis).toBe("ok");
    expect(body.status).toBe("ok");
  });
});
