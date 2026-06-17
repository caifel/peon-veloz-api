import { describe, it, expect } from "bun:test";
import { paginate, paginatedResponse, pageMeta } from "../src/lib/pagination";
import { ok, created, noContent } from "../src/lib/response";
import { AppError, BadRequest, NotFound, Conflict } from "../src/lib/errors";

describe("paginate()", () => {
  it("returns safe defaults with no args", () => {
    const p = paginate({});
    expect(p.page).toBe(1);
    expect(p.limit).toBe(20);
    expect(p.offset).toBe(0);
  });

  it("parses numeric strings", () => {
    const p = paginate({ page: "3", limit: "5" });
    expect(p.page).toBe(3);
    expect(p.limit).toBe(5);
    expect(p.offset).toBe(10);
  });

  it("clamps page < 1 to 1", () => {
    expect(paginate({ page: "0" }).page).toBe(1);
  });

  it("clamps limit < 1 to 20", () => {
    expect(paginate({ limit: "-5" }).limit).toBe(20);
  });

  it("caps limit at 100", () => {
    expect(paginate({ limit: "999" }).limit).toBe(100);
  });

  it("handles bogus strings", () => {
    const p = paginate({ page: "abc", limit: "xyz" });
    expect(p.page).toBe(1);
    expect(p.limit).toBe(20);
  });
});

describe("paginatedResponse()", () => {
  it("wraps data + meta", () => {
    const r = paginatedResponse([{ id: 1 }], { page: 1, limit: 10, total: 42, totalPages: 5 });
    expect(r.data).toEqual([{ id: 1 }]);
    expect(r.meta.total).toBe(42);
    expect(r.meta.totalPages).toBe(5);
  });
});

describe("pageMeta()", () => {
  it("computes totalPages", () => {
    expect(pageMeta(42, { page: 1, limit: 10, offset: 0 }).totalPages).toBe(5);
  });
  it("at least 1 totalPages for empty", () => {
    expect(pageMeta(0, { page: 1, limit: 10, offset: 0 }).totalPages).toBe(1);
  });
});

describe("ok()", () => {
  it("wraps in { data }", () => {
    expect(ok({ id: 7 })).toEqual({ data: { id: 7 } });
  });
});

describe("created()", () => {
  it("sets 201 + wraps data", () => {
    const set = { status: 0 };
    const r = created({ id: 9 }, set as { status: number });
    expect(set.status).toBe(201);
    expect(r).toEqual({ data: { id: 9 } });
  });
});

describe("noContent()", () => {
  it("sets 204 + returns undefined", () => {
    const set = { status: 0 };
    expect(noContent(set as { status: number })).toBeUndefined();
    expect(set.status).toBe(204);
  });
});

describe("AppError", () => {
  it("stores status, code, message", () => {
    const e = new AppError(418, "TEAPOT", "brew");
    expect(e.statusCode).toBe(418);
    expect(e.code).toBe("TEAPOT");
    expect(e.message).toBe("brew");
  });
});

describe("BadRequest", () => {
  it("is 400 BAD_REQUEST", () => {
    const e = new BadRequest("missing", { field: "x" });
    expect(e.statusCode).toBe(400);
    expect(e.code).toBe("BAD_REQUEST");
    expect(e.details).toEqual({ field: "x" });
  });
});

describe("NotFound", () => {
  it("is 404 NOT_FOUND", () => {
    const e = new NotFound("gone");
    expect(e.statusCode).toBe(404);
    expect(e.code).toBe("NOT_FOUND");
  });
  it("has default message", () => {
    expect(new NotFound().message).toBe("Resource not found");
  });
});

describe("Conflict", () => {
  it("is 409 CONFLICT", () => {
    const e = new Conflict("dup");
    expect(e.statusCode).toBe(409);
    expect(e.code).toBe("CONFLICT");
  });
});
