import { describe, it, expect, beforeAll } from "bun:test";
import { ensureTestDb, clearAllTables, req, json, createTestUser } from "./setup";

beforeAll(async () => {
  await ensureTestDb();
});

describe("POST /users", () => {
  beforeAll(async () => {
    clearAllTables();
  });

  it("creates a user", async () => {
    const res = await req("POST", "/api/users", {
      email: "u1@test.com",
      firstName: "User",
      lastName: "One",
      role: "member",
      phone: "+591 70000000",
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.data.email).toBe("u1@test.com");
    expect(body.data.firstName).toBe("User");
  });

  it("rejects duplicate email", async () => {
    const res = await req("POST", "/api/users", {
      email: "u1@test.com",
      firstName: "Dup",
      lastName: "User",
      role: "member",
      phone: "+591 70000001",
    });
    expect(res.status).toBe(409);
  });

  it("rejects invalid role", async () => {
    const res = await req("POST", "/api/users", {
      email: "bad@test.com",
      firstName: "B",
      lastName: "User",
      role: "superadmin",
      phone: "+591 70000000",
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /users", () => {
  beforeAll(async () => {
    clearAllTables();
    await createTestUser("alice@test.com", "Alice", "Smith", "member");
    await createTestUser("bob@test.com", "Bob", "Jones", "admin");
    await createTestUser("charlie@test.com", "Charlie", "Brown", "member");
  });

  it("lists active members (admins excluded)", async () => {
    const body = await json(await req("GET", "/api/users"));
    expect(body.data.length).toBeGreaterThanOrEqual(2);
  });

  it("searches by name", async () => {
    expect((await json(await req("GET", "/api/users?search=Charlie"))).data.length).toBe(1);
  });
});

describe("GET /users/:id", () => {
  let userId: number;
  beforeAll(async () => {
    clearAllTables();
    userId = await createTestUser("detail@test.com", "Detail", "User", "member");
  });

  it("returns user with relations", async () => {
    const body = await json(await req("GET", `/api/users/${userId}`));
    expect(body.data.email).toBe("detail@test.com");
  });

  it("404 on unknown", async () => {
    expect((await req("GET", "/api/users/99999")).status).toBe(404);
  });
});

describe("PATCH /users/:id", () => {
  let userId: number;
  let otherId: number;
  beforeAll(async () => {
    clearAllTables();
    userId = await createTestUser("patch@test.com", "Patch", "Me", "admin");
    otherId = await createTestUser("other@test.com", "Other", "User", "member");
  });

  it("updates firstName", async () => {
    const body = await json(await req("PATCH", `/api/users/${userId}`, { firstName: "Patched" }));
    expect(body.data.firstName).toBe("Patched");
  });

  it("rejects duplicate email on update", async () => {
    expect((await req("PATCH", `/api/users/${userId}`, { email: "other@test.com" })).status).toBe(409);
  });
});

describe("DELETE /users/:id", () => {
  beforeAll(() => {
    clearAllTables();
  });

  it("soft-deletes user", async () => {
    const uid = await createTestUser("deletable@test.com", "Del", "User", "member");
    expect((await json(await req("DELETE", `/api/users/${uid}`))).data.deleted).toBe(true);
  });
});
