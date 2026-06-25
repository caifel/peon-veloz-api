import { int, sqliteTable, text, uniqueIndex, check, index } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function createdAt(name = "created_at") {
  return int(name, { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date());
}

function updatedAt(name = "updated_at") {
  return int(name, { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date());
}

function timestamps() {
  return {
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  };
}

/** Columnas compartidas entre inscriptions y donations */
function paymentColumns() {
  return {
    tournamentId: int("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amount: int().notNull(), // centavos (ej: 500 = 5.00 BOB)
    currency: text().notNull().default("BOB"),
    ...timestamps(),
  };
}

// ═══════════════════════════════════════════════════════════════
// Health checks (audit / uptime log — not for active probing)
// ═══════════════════════════════════════════════════════════════

export const healthChecks = sqliteTable("health_checks", {
  id: int().primaryKey({ autoIncrement: true }),
  status: text({ enum: ["healthy", "degraded", "unhealthy"] }).notNull(),
  createdAt: createdAt(),
});

// ═══════════════════════════════════════════════════════════════
// Sessions — cookie-based auth tokens  (próximo a morir)
// ═══════════════════════════════════════════════════════════════

export const sessions = sqliteTable("sessions", {
  id: int().primaryKey({ autoIncrement: true }),
  userId: int("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: int("expires_at", { mode: "timestamp" }).notNull(),
  revokedAt: int("revoked_at", { mode: "timestamp" }),
  createdAt: createdAt(),
});

// ═══════════════════════════════════════════════════════════════
// Users — authentication + base profile
// ═══════════════════════════════════════════════════════════════

export const users = sqliteTable(
  "users",
  {
    id: int().primaryKey({ autoIncrement: true }),
    lichessId: text("lichess_id").notNull().unique(),
    lichessUsername: text("lichess_username"),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    role: text({ enum: ["admin", "member"] }).notNull(),
    birthDate: text("birth_date"),
    phone: text().notNull().unique(),
    gender: text({ enum: ["male", "female", "other"] }),
    countryName: text("country_name"),
    stateName: text("state_name"),
    email: text().unique(),
    isActive: int("is_active", { mode: "boolean" }).notNull().default(true),
    ...timestamps(),
  },
  (table) => ({
    roleCheck: check(
      "role_check",
      sql`${table.role} IN ('admin','member')`,
    ),
    genderCheck: check(
      "gender_check",
      sql`${table.gender} IS NULL OR ${table.gender} IN ('male','female','other')`,
    ),
    birthDateCheck: check(
      "birth_date_check",
      sql`${table.birthDate} IS NULL OR ${table.birthDate} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`,
    ),
  }),
);

// ═══════════════════════════════════════════════════════════════
// Tournaments — fuente canónica para crear torneos de Lichess
// ═══════════════════════════════════════════════════════════════

export const tournaments = sqliteTable(
  "tournaments",
  {
    id: int().primaryKey({ autoIncrement: true }),
    name: text().notNull(),
    startTime: int("start_time", { mode: "timestamp" }).notNull(),
    location: text(),
    onlineUrl: text("online_url"),
    organizerName: text("organizer_name"),
    systemOfPlay: text("system_of_play", {
      enum: ["pool", "arena", "swiss", "round-robin"],
    }).notNull(),
    chessVariant: text("chess_variant", {
      enum: [
        "standard",
        "chess960",
        "crazyhouse",
        "antichess",
        "atomic",
        "horde",
        "kingOfTheHill",
        "racingKings",
        "threeCheck",
      ],
    })
      .notNull()
      .default("standard"),
    clockTime: int("clock_time").notNull(), // segundos
    clockIncrement: int("clock_increment").notNull().default(0), // segundos
    durationInMinutes: int("duration_in_minutes").notNull(),
    description: text(),
    maxParticipants: int("max_participants"),
    registrationDeadline: int("registration_deadline", { mode: "timestamp" }),
    inscriptionPriceMin: int("inscription_price_min").notNull().default(0),
    inscriptionPriceMax: int("inscription_price_max").notNull().default(0),
    rounds: int(),
    slug: text().notNull().unique(),
    isActive: int("is_active", { mode: "boolean" }).notNull().default(true),
    ...timestamps(),
  },
  (table) => ({
    roundsCheck: check(
      "rounds_check",
      sql`(${table.systemOfPlay} IN ('swiss','round-robin') AND ${table.rounds} IS NOT NULL) OR (${table.systemOfPlay} NOT IN ('swiss','round-robin') AND ${table.rounds} IS NULL)`,
    ),
    priceRangeCheck: check(
      "price_range_check",
      sql`${table.inscriptionPriceMin} <= ${table.inscriptionPriceMax}`,
    ),
    priceMinCheck: check(
      "price_min_check",
      sql`${table.inscriptionPriceMin} >= 0`,
    ),
    clockTimeCheck: check(
      "clock_time_check",
      sql`${table.clockTime} > 0`,
    ),
    clockIncrementCheck: check(
      "clock_increment_check",
      sql`${table.clockIncrement} >= 0`,
    ),
    durationCheck: check(
      "duration_check",
      sql`${table.durationInMinutes} > 0`,
    ),
    maxParticipantsCheck: check(
      "max_participants_check",
      sql`${table.maxParticipants} IS NULL OR ${table.maxParticipants} > 0`,
    ),
    deadlineCheck: check(
      "deadline_check",
      sql`${table.registrationDeadline} IS NULL OR ${table.registrationDeadline} < ${table.startTime}`,
    ),
    // Índices
    startTimeIdx: index("tournaments_start_time_idx").on(table.startTime),
    systemOfPlayIdx: index("tournaments_system_of_play_idx").on(table.systemOfPlay),
    activeStartIdx: index("tournaments_active_start_idx").on(table.isActive, table.startTime),
  }),
);

// ═══════════════════════════════════════════════════════════════
// Inscriptions — un usuario solo puede inscribirse una vez por torneo
// ═══════════════════════════════════════════════════════════════

export const inscriptions = sqliteTable(
  "inscriptions",
  {
    id: int().primaryKey({ autoIncrement: true }),
    ...paymentColumns(),
  },
  (table) => ({
    uniqueInscription: uniqueIndex("inscriptions_tournament_user_unique").on(
      table.tournamentId,
      table.userId,
    ),
    userIdIdx: index("inscriptions_user_id_idx").on(table.userId),
  }),
);

// ═══════════════════════════════════════════════════════════════
// Donations — un usuario puede donar múltiples veces al mismo torneo
// ═══════════════════════════════════════════════════════════════

export const donations = sqliteTable(
  "donations",
  {
    id: int().primaryKey({ autoIncrement: true }),
    ...paymentColumns(),
    note: text(), // mensaje opcional del donante
  },
  (table) => ({
    userIdIdx: index("donations_user_id_idx").on(table.userId),
    tournamentIdIdx: index("donations_tournament_id_idx").on(table.tournamentId),
  }),
);

// ═══════════════════════════════════════════════════════════════
// Prizes
// ═══════════════════════════════════════════════════════════════

export const prizes = sqliteTable(
  "prizes",
  {
    id: int().primaryKey({ autoIncrement: true }),
    tournamentId: int("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    label: text().notNull(),
    rank: int().notNull(), // 1 = primer lugar — sin default, forzar explícito
    type: text({ enum: ["fixed", "percentage"] }).notNull(),
    amount: int(), // centavos, requerido si type = 'fixed'
    percentage: int(), // requerido si type = 'percentage'
    ...timestamps(),
  },
  (table) => ({
    prizeTypeCheck: check(
      "prize_type_check",
      sql`(${table.type} = 'fixed' AND ${table.amount} IS NOT NULL AND ${table.percentage} IS NULL) OR (${table.type} = 'percentage' AND ${table.percentage} IS NOT NULL AND ${table.amount} IS NULL)`,
    ),
    rankCheck: check(
      "rank_check",
      sql`${table.rank} > 0`,
    ),
    tournamentIdIdx: index("prizes_tournament_id_idx").on(table.tournamentId),
  }),
);

// ═══════════════════════════════════════════════════════════════
// Drizzle Relations — type-safe query helpers
// ═══════════════════════════════════════════════════════════════

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  inscriptions: many(inscriptions),
  donations: many(donations),
}));

export const tournamentsRelations = relations(tournaments, ({ many }) => ({
  inscriptions: many(inscriptions),
  donations: many(donations),
  prizes: many(prizes),
}));

export const inscriptionsRelations = relations(inscriptions, ({ one }) => ({
  tournament: one(tournaments, {
    fields: [inscriptions.tournamentId],
    references: [tournaments.id],
  }),
  user: one(users, {
    fields: [inscriptions.userId],
    references: [users.id],
  }),
}));

export const donationsRelations = relations(donations, ({ one }) => ({
  tournament: one(tournaments, {
    fields: [donations.tournamentId],
    references: [tournaments.id],
  }),
  user: one(users, {
    fields: [donations.userId],
    references: [users.id],
  }),
}));

export const prizesRelations = relations(prizes, ({ one }) => ({
  tournament: one(tournaments, {
    fields: [prizes.tournamentId],
    references: [tournaments.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));
