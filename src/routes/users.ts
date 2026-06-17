import { Elysia, t } from "elysia";
import { eq, like, and, or, sql, desc, asc } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema";
import { paginate, paginatedResponse, pageMeta } from "../lib/pagination";
import { ok, created } from "../lib/response";
import { NotFound, Conflict, Forbidden, Unauthorized, BadRequest } from "../lib/errors";
import {
  DataResponse,
  PaginatedResponse,
  IsoDate,
  UserRoleEnum,
  ErrorResponse,
} from "../lib/schemas";

const UserRole = UserRoleEnum;
const TAG = ["Users"];

function requireAuth({ currentUser }: any) {
  if (!currentUser) throw new Unauthorized();
}

function requireAdmin({ currentUser }: any) {
  if (!currentUser || currentUser.role !== "admin") throw new Forbidden("Admin role required");
}

// ── Response schemas ───────────────────────────────────────────

const UserListRow = t.Object({
  id: t.Number(),
  email: t.Nullable(t.String()),
  lichessUsername: t.Nullable(t.String()),
  firstName: t.String(),
  lastName: t.String(),
  phone: t.String(),
  birthDate: t.Nullable(IsoDate),
  gender: t.Nullable(t.String()),
  address: t.Nullable(t.String()),
  isActive: t.Boolean(),
});

const UserDetail = t.Object({
  id: t.Number(),
  email: t.Nullable(t.String()),
  lichessUsername: t.Nullable(t.String()),
  firstName: t.String(),
  lastName: t.String(),
  phone: t.String(),
  birthDate: t.Nullable(IsoDate),
  gender: t.Nullable(t.String()),
  address: t.Nullable(t.String()),
  isActive: t.Boolean(),
});

const UserCreated = t.Object({
  id: t.Number(),
  email: t.Nullable(t.String()),
  firstName: t.String(),
  lastName: t.String(),
  role: UserRoleEnum,
  createdAt: IsoDate,
});

const UserUpdated = t.Object({
  id: t.Number(),
  email: t.Nullable(t.String()),
  firstName: t.String(),
  lastName: t.String(),
  role: UserRoleEnum,
});

const DeleteResponse = DataResponse(t.Object({ deleted: t.Boolean() }));

// ── Routes ─────────────────────────────────────────────────────

export const usersRoutes = new Elysia({ prefix: "/api/users" })

  .get(
    "/",
    async ({ query }) => {
      const { page, limit, offset } = paginate(query);
      const filters: ReturnType<typeof and>[] = [
        eq(users.role, "member"),
      ];

      if (query.isActive !== undefined) {
        filters.push(eq(users.isActive, query.isActive === "true"));
      }

      // Search — split by whitespace, each term matches firstName OR lastName
      const searchTerms = query.search?.trim().split(/\s+/).filter(Boolean) ?? [];
      for (const term of searchTerms) {
        const pattern = `%${term}%`;
        filters.push(or(like(users.firstName, pattern), like(users.lastName, pattern)));
      }

      const where = and(...filters);

      const [cr] = await db
        .select({ cnt: sql<number>`count(*)` })
        .from(users)
        .where(where);

      // Sort
      const sortColumns: Record<string, ReturnType<typeof desc> | ReturnType<typeof asc>> = {
        firstName: users.firstName,
        lastName: users.lastName,
        birthDate: users.birthDate,
      };
      const sortKey = query.sort ?? "lastName";
      if (!(sortKey in sortColumns)) {
        throw new BadRequest(`Invalid sort: "${sortKey}". Valid: ${Object.keys(sortColumns).join(", ")}`);
      }
      const sortCol = sortColumns[sortKey];
      const orderBy = query.order === "desc" ? desc(sortCol) : asc(sortCol);

      const rows = await db
        .select({
          id: users.id,
          email: users.email,
          lichessUsername: users.lichessUsername,
          firstName: users.firstName,
          lastName: users.lastName,
          phone: users.phone,
          birthDate: users.birthDate,
          gender: users.gender,
          address: users.address,
          isActive: users.isActive,
        })
        .from(users)
        .where(where)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset);
      return paginatedResponse(rows, pageMeta(Number(cr.cnt), { page, limit, offset }));
    },
    {
      beforeHandle: requireAdmin,
      detail: { tags: TAG },
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        sort: t.Optional(t.String()),
        order: t.Optional(t.String()),
        search: t.Optional(t.String()),
        isActive: t.Optional(t.String()),
      }),
      response: { 200: PaginatedResponse(UserListRow), 401: ErrorResponse },
    },
  )

  .get(
    "/:id",
    async ({ params }) => {
      const id = Number(params.id);
      const [row] = await db
        .select({
          id: users.id,
          email: users.email,
          lichessUsername: users.lichessUsername,
          firstName: users.firstName,
          lastName: users.lastName,
          phone: users.phone,
          birthDate: users.birthDate,
          gender: users.gender,
          address: users.address,
          isActive: users.isActive,
        })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      if (!row) throw new NotFound("User not found");
      return ok(row);
    },
    {
      beforeHandle: requireAuth,
      detail: { tags: TAG },
      params: t.Object({ id: t.String() }),
      response: { 200: DataResponse(UserDetail), 401: ErrorResponse, 404: ErrorResponse },
    },
  )

  .post(
    "/",
    async ({ body, set }) => {
      const email = body.email?.toLowerCase().trim() || null;
      if (email) {
        const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
        if (exists) throw new Conflict("A user with this email already exists");
      }
      const [row] = await db
        .insert(users)
        .values({
          email,
          firstName: body.firstName,
          lastName: body.lastName,
          role: body.role,
          phone: body.phone,
          birthDate: body.birthDate ? new Date(body.birthDate) : undefined,
          gender: body.gender ?? undefined,
          address: body.address ?? null,
        })
        .returning({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
          createdAt: users.createdAt,
        });
      return created(row, set);
    },
    {
      beforeHandle: requireAdmin,
      detail: { tags: TAG },
      body: t.Object({
        email: t.Optional(t.String()),
        firstName: t.String(),
        lastName: t.String(),
        role: UserRole,
        phone: t.String(),
        birthDate: t.Optional(t.String()),
        gender: t.Optional(t.Nullable(t.String())),
        address: t.Optional(t.Nullable(t.String())),
      }),
      response: { 201: DataResponse(UserCreated), 401: ErrorResponse, 403: ErrorResponse },
    },
  )

  .patch(
    "/:id",
    async ({ params, body }) => {
      const id = Number(params.id);
      const [ex] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      if (!ex) throw new NotFound("User not found");
      if (body.email && body.email.toLowerCase().trim() !== ex.email) {
        const [dup] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, body.email.toLowerCase().trim()))
          .limit(1);
        if (dup) throw new Conflict("Email already in use");
      }
      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (body.firstName !== undefined) updateData.firstName = body.firstName;
      if (body.lastName !== undefined) updateData.lastName = body.lastName;
      if (body.email !== undefined) updateData.email = body.email.toLowerCase().trim();
      if (body.role !== undefined) updateData.role = body.role;
      if (body.phone !== undefined) updateData.phone = body.phone;
      if (body.birthDate !== undefined) updateData.birthDate = body.birthDate ? new Date(body.birthDate) : undefined;
      if (body.gender !== undefined) updateData.gender = body.gender;
      if (body.address !== undefined) updateData.address = body.address;
      if (body.isActive !== undefined) updateData.isActive = body.isActive;
      const [row] = await db.update(users).set(updateData).where(eq(users.id, id)).returning({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
      });
      return ok(row);
    },
    {
      beforeHandle: requireAdmin,
      detail: { tags: TAG },
      params: t.Object({ id: t.String() }),
      body: t.Object({
        email: t.Optional(t.String()),
        firstName: t.Optional(t.String()),
        lastName: t.Optional(t.String()),
        role: t.Optional(UserRole),
        phone: t.Optional(t.String()),
        birthDate: t.Optional(t.Nullable(t.String())),
        gender: t.Optional(t.Nullable(t.String())),
        address: t.Optional(t.Nullable(t.String())),
        isActive: t.Optional(t.Boolean()),
      }),
      response: DataResponse(UserUpdated),
    },
  )

  .delete(
    "/:id",
    async ({ params }) => {
      const id = Number(params.id);
      const [ex] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      if (!ex) throw new NotFound("User not found");
      await db
        .update(users)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(users.id, id));
      return ok({ deleted: true });
    },
    {
      beforeHandle: requireAdmin,
      detail: { tags: TAG },
      params: t.Object({ id: t.String() }),
      response: DeleteResponse,
    },
  );
