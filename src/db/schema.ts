import { int, sqliteTable, text, index, check, primaryKey } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";

// ═══════════════════════════════════════════════════════════════
// Health checks (audit / uptime log — not for active probing)
// ═══════════════════════════════════════════════════════════════

export const healthChecks = sqliteTable("health_checks", {
  id: int().primaryKey({ autoIncrement: true }),
  status: text().notNull(),
  createdAt: int("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ═══════════════════════════════════════════════════════════════
// Sessions — cookie-based auth tokens
// ═══════════════════════════════════════════════════════════════

export const sessions = sqliteTable("sessions", {
  id: int().primaryKey({ autoIncrement: true }),
  userId: int("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: int("expires_at", { mode: "timestamp" }).notNull(),
  revokedAt: int("revoked_at", { mode: "timestamp" }),
  createdAt: int("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ═══════════════════════════════════════════════════════════════
// Users — authentication + base profile
// ═══════════════════════════════════════════════════════════════

export const users = sqliteTable("users", {
  id: int().primaryKey({ autoIncrement: true }),
  lichessId: text("lichess_id").unique(),
  lichessUsername: text("lichess_username"),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  role: text({ enum: ["admin", "member"] }).notNull(),
  birthDate: int("birth_date", { mode: "timestamp" }),
  phone: text().notNull(),
  gender: text(),
  address: text(),
  email: text().unique(),
  isActive: int("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: int("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: int("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
});

// ═══════════════════════════════════════════════════════════════
// Tournaments
// ═══════════════════════════════════════════════════════════════

export const tournaments = sqliteTable("tournaments", {
  id: int().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  startTime: int("start_time", { mode: "timestamp" }).notNull(),
  location: text(),
  systemOfPlay: text("system_of_play", {
    enum: ["round-robin", "swiss", "knockout", "match", "scheveningen"],
  }).notNull(),
  category: text({ enum: ["classical", "rapid", "blitz"] }).notNull(),
  timeControl: text("time_control").notNull(),
  numberOfRounds: int("number_of_rounds").notNull(),
  createdBy: int("created_by").references(() => users.id),
  updatedBy: int("updated_by").references(() => users.id),
  createdAt: int("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: int("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
});

// ═══════════════════════════════════════════════════════════════
// Drizzle Relations — type-safe query helpers
// ═══════════════════════════════════════════════════════════════

export const usersRelations = relations(users, ({ many }) => ({
  createdTournaments: many(tournaments, { relationName: "createdBy" }),
  updatedTournaments: many(tournaments, { relationName: "updatedBy" }),
  sessions: many(sessions),
}));

export const tournamentsRelations = relations(tournaments, ({ one }) => ({
  createdByUser: one(users, {
    fields: [tournaments.createdBy],
    references: [users.id],
    relationName: "createdBy",
  }),
  updatedByUser: one(users, {
    fields: [tournaments.updatedBy],
    references: [users.id],
    relationName: "updatedBy",
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));
