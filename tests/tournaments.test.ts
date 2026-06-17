import { describe, it, expect, beforeAll } from "bun:test";
import { ensureTestDb, clearAllTables, req, json } from "./setup";

beforeAll(async () => {
  await ensureTestDb();
});

const baseTournament = {
  name: "Intercolegial Test",
  startTime: new Date(Date.now() + 7 * 864e5).toISOString(),
  location: "Sala Principal",
  systemOfPlay: "swiss",
  category: "classical",
  timeControl: "60+30",
  numberOfRounds: 5,
};

describe("POST /tournaments", () => {
  beforeAll(() => {
    clearAllTables();
  });

  it("creates a tournament event", async () => {
    const res = await req("POST", "/api/tournaments", baseTournament);
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.data.name).toBe(baseTournament.name);
    expect(body.data.systemOfPlay).toBe("swiss");
    expect(body.data.timeControl).toBe("60+30");
    expect(body.data.numberOfRounds).toBe(5);
    expect(body.data.createdBy).toBeTruthy();
    expect(body.data.updatedBy).toBeTruthy();
  });

  it("rejects missing required fields", async () => {
    expect((await req("POST", "/api/tournaments", { name: "Incomplete" })).status).toBe(400);
  });
});

describe("GET /tournaments", () => {
  beforeAll(async () => {
    clearAllTables();
    await req("POST", "/api/tournaments", baseTournament);
    await req("POST", "/api/tournaments", {
      ...baseTournament,
      name: "Round Robin Test",
      systemOfPlay: "round-robin",
      startTime: new Date(Date.now() + 14 * 864e5).toISOString(),
    });
  });

  it("lists tournaments", async () => {
    const body = await json(await req("GET", "/api/tournaments"));
    expect(body.data.length).toBe(2);
  });

  it("filters by system of play", async () => {
    const body = await json(await req("GET", "/api/tournaments?systemOfPlay=round-robin"));
    expect(body.data.length).toBe(1);
    expect(body.data[0].name).toBe("Round Robin Test");
  });
});

describe("GET /tournaments/:id", () => {
  let tournamentId: number;

  beforeAll(async () => {
    clearAllTables();
    tournamentId = (await json(await req("POST", "/api/tournaments", baseTournament))).data.id;
  });

  it("returns tournament audit users", async () => {
    const body = await json(await req("GET", `/api/tournaments/${tournamentId}`));
    expect(body.data.name).toBe(baseTournament.name);
    expect(body.data.createdByUser.email).toBe("admin@test.com");
    expect(body.data.updatedByUser.email).toBe("admin@test.com");
  });

  it("404 on unknown tournament", async () => {
    expect((await req("GET", "/api/tournaments/99999")).status).toBe(404);
  });
});

describe("PATCH /tournaments/:id", () => {
  let tournamentId: number;

  beforeAll(async () => {
    clearAllTables();
    tournamentId = (await json(await req("POST", "/api/tournaments", baseTournament))).data.id;
  });

  it("updates tournament event fields", async () => {
    const body = await json(
      await req("PATCH", `/api/tournaments/${tournamentId}`, {
        location: "Sala B",
        timeControl: "90+30",
        numberOfRounds: 7,
      }),
    );
    expect(body.data.location).toBe("Sala B");
    expect(body.data.timeControl).toBe("90+30");
    expect(body.data.numberOfRounds).toBe(7);
    expect(body.data.updatedBy).toBeTruthy();
  });
});

describe("DELETE /tournaments/:id", () => {
  let tournamentId: number;

  beforeAll(async () => {
    clearAllTables();
    tournamentId = (await json(await req("POST", "/api/tournaments", baseTournament))).data.id;
  });

  it("deletes a tournament event", async () => {
    expect((await json(await req("DELETE", `/api/tournaments/${tournamentId}`))).data.deleted).toBe(
      true,
    );
    expect((await req("GET", `/api/tournaments/${tournamentId}`)).status).toBe(404);
  });
});
