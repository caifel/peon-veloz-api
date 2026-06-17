import { Elysia, t } from "elysia";
import { eq, and, sql, like, desc } from "drizzle-orm";
import { db } from "../db/client";
import { tournaments, users } from "../db/schema";
import { paginate, paginatedResponse, pageMeta } from "../lib/pagination";
import { ok, created } from "../lib/response";
import { NotFound, Forbidden, Unauthorized } from "../lib/errors";
import { requireAuth } from "../lib/auth";
import {
  DataResponse,
  PaginatedResponse,
  IsoDate,
  SystemOfPlayEnum,
  TournamentCategoryEnum,
} from "../lib/schemas";

const TAG = ["Tournaments"];

const UserAudit = t.Nullable(
  t.Object({
    id: t.Number(),
    email: t.Nullable(t.String()),
    firstName: t.String(),
    lastName: t.String(),
  }),
);

const TournamentRow = t.Object({
  id: t.Number(),
  name: t.String(),
  startTime: IsoDate,
  location: t.Nullable(t.String()),
  systemOfPlay: SystemOfPlayEnum,
  category: TournamentCategoryEnum,
  timeControl: t.String(),
  numberOfRounds: t.Number(),
  createdBy: t.Nullable(t.Number()),
  updatedBy: t.Nullable(t.Number()),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});

const TournamentDetail = t.Object({
  id: t.Number(),
  name: t.String(),
  startTime: IsoDate,
  location: t.Nullable(t.String()),
  systemOfPlay: SystemOfPlayEnum,
  category: TournamentCategoryEnum,
  timeControl: t.String(),
  numberOfRounds: t.Number(),
  createdBy: t.Nullable(t.Number()),
  updatedBy: t.Nullable(t.Number()),
  createdAt: IsoDate,
  updatedAt: IsoDate,
  createdByUser: UserAudit,
  updatedByUser: UserAudit,
});

const DeleteResponse = DataResponse(t.Object({ deleted: t.Boolean() }));

function currentUserId(currentUser: { id: number } | null | undefined) {
  return currentUser?.id ?? null;
}

function requireAdmin({ currentUser }: any) {
  if (!currentUser || currentUser.role !== "admin") throw new Forbidden("Admin role required");
}

export const tournamentsRoutes = new Elysia({ prefix: "/api/tournaments" })

  .get(
    "/",
    async ({ query }) => {
      const { page, limit, offset } = paginate(query);
      const filters: ReturnType<typeof and>[] = [];
      if (query.search) filters.push(like(tournaments.name, `%${query.search}%`));
      if (query.systemOfPlay) filters.push(eq(tournaments.systemOfPlay, query.systemOfPlay as any));
      if (query.category) filters.push(eq(tournaments.category, query.category as any));
      const where = filters.length > 0 ? and(...filters) : undefined;

      const [cr] = await db
        .select({ cnt: sql<number>`count(*)` })
        .from(tournaments)
        .where(where);
      const rows = await db
        .select({
          id: tournaments.id,
          name: tournaments.name,
          startTime: tournaments.startTime,
          location: tournaments.location,
          systemOfPlay: tournaments.systemOfPlay,
          category: tournaments.category,
          timeControl: tournaments.timeControl,
          numberOfRounds: tournaments.numberOfRounds,
          createdBy: tournaments.createdBy,
          updatedBy: tournaments.updatedBy,
          createdAt: tournaments.createdAt,
          updatedAt: tournaments.updatedAt,
        })
        .from(tournaments)
        .where(where)
        .orderBy(desc(tournaments.startTime))
        .limit(limit)
        .offset(offset);

      return paginatedResponse(rows, pageMeta(Number(cr.cnt), { page, limit, offset }));
    },
    {
      detail: { tags: TAG },
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        search: t.Optional(t.String()),
        systemOfPlay: t.Optional(SystemOfPlayEnum),
        category: t.Optional(TournamentCategoryEnum),
      }),
      response: PaginatedResponse(TournamentRow),
    },
  )

  .get(
    "/:id",
    async ({ params }) => {
      const id = Number(params.id);
      const [row] = await db
        .select({
          id: tournaments.id,
          name: tournaments.name,
          startTime: tournaments.startTime,
          location: tournaments.location,
          systemOfPlay: tournaments.systemOfPlay,
          category: tournaments.category,
          timeControl: tournaments.timeControl,
          numberOfRounds: tournaments.numberOfRounds,
          createdBy: tournaments.createdBy,
          updatedBy: tournaments.updatedBy,
          createdAt: tournaments.createdAt,
          updatedAt: tournaments.updatedAt,
          createdByUser: {
            id: users.id,
            email: users.email,
            firstName: users.firstName,
            lastName: users.lastName,
          },
        })
        .from(tournaments)
        .leftJoin(users, eq(tournaments.createdBy, users.id))
        .where(eq(tournaments.id, id))
        .limit(1);
      if (!row) throw new NotFound("Tournament not found");

      const [updatedByUser] = row.updatedBy
        ? await db
            .select({
              id: users.id,
              email: users.email,
              firstName: users.firstName,
              lastName: users.lastName,
            })
            .from(users)
            .where(eq(users.id, row.updatedBy))
            .limit(1)
        : [null];

      return ok({ ...row, updatedByUser });
    },
    {
      beforeHandle: requireAuth,
      detail: { tags: TAG },
      params: t.Object({ id: t.String() }),
      response: DataResponse(TournamentDetail),
    },
  )

  .post(
    "/",
    async ({ body, set, currentUser }) => {
      const userId = currentUserId(currentUser);
      const [row] = await db
        .insert(tournaments)
        .values({
          name: body.name,
          startTime: new Date(body.startTime),
          location: body.location ?? null,
          systemOfPlay: body.systemOfPlay,
          category: body.category,
          timeControl: body.timeControl,
          numberOfRounds: body.numberOfRounds,
          createdBy: userId,
          updatedBy: userId,
        })
        .returning();
      return created(row, set);
    },
    {
      beforeHandle: requireAdmin,
      detail: { tags: TAG },
      body: t.Object({
        name: t.String(),
        startTime: IsoDate,
        location: t.Optional(t.Nullable(t.String())),
        systemOfPlay: SystemOfPlayEnum,
        category: TournamentCategoryEnum,
        timeControl: t.String(),
        numberOfRounds: t.Numeric(),
      }),
      response: { 201: DataResponse(TournamentRow) },
    },
  )

  .patch(
    "/:id",
    async ({ params, body, currentUser }) => {
      const id = Number(params.id);
      const [ex] = await db
        .select({ id: tournaments.id })
        .from(tournaments)
        .where(eq(tournaments.id, id))
        .limit(1);
      if (!ex) throw new NotFound("Tournament not found");

      const [row] = await db
        .update(tournaments)
        .set({
          ...(body.name !== undefined && { name: body.name }),
          ...(body.startTime !== undefined && { startTime: new Date(body.startTime) }),
          ...(body.location !== undefined && { location: body.location }),
          ...(body.systemOfPlay !== undefined && { systemOfPlay: body.systemOfPlay }),
          ...(body.category !== undefined && { category: body.category }),
          ...(body.timeControl !== undefined && { timeControl: body.timeControl }),
          ...(body.numberOfRounds !== undefined && { numberOfRounds: body.numberOfRounds }),
          updatedBy: currentUserId(currentUser),
          updatedAt: new Date(),
        })
        .where(eq(tournaments.id, id))
        .returning();
      return ok(row);
    },
    {
      beforeHandle: requireAdmin,
      detail: { tags: TAG },
      params: t.Object({ id: t.String() }),
      body: t.Object({
        name: t.Optional(t.String()),
        startTime: t.Optional(IsoDate),
        location: t.Optional(t.Nullable(t.String())),
        systemOfPlay: t.Optional(SystemOfPlayEnum),
        category: t.Optional(TournamentCategoryEnum),
        timeControl: t.Optional(t.String()),
        numberOfRounds: t.Optional(t.Numeric()),
      }),
      response: DataResponse(TournamentRow),
    },
  )

  .delete(
    "/:id",
    async ({ params }) => {
      const id = Number(params.id);
      const [ex] = await db
        .select({ id: tournaments.id })
        .from(tournaments)
        .where(eq(tournaments.id, id))
        .limit(1);
      if (!ex) throw new NotFound("Tournament not found");
      await db.delete(tournaments).where(eq(tournaments.id, id));
      return ok({ deleted: true });
    },
    {
      beforeHandle: requireAdmin,
      detail: { tags: TAG },
      params: t.Object({ id: t.String() }),
      response: DeleteResponse,
    },
  );
