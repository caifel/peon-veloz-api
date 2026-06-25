/**
 * Shared Elysia response schemas and date normalization.
 *
 * Principle: all Date values in responses become ISO-8601 strings
 * matching the API.md contract. The `normalizeDates` helper walks
 * any response object and converts Date → string (null stays null).
 */
import { t } from "elysia";

export type Jsonified<T> = T extends Date
  ? string
  : T extends Array<infer U>
    ? Jsonified<U>[]
    : T extends object
      ? { [K in keyof T]: Jsonified<T[K]> }
      : T;

// ═══════════════════════════════════════════════════════════════
// Primitives
// ═══════════════════════════════════════════════════════════════

/** ISO-8601 string (coerced from Date via normalizeDates) */
export const IsoDate = t.String({ format: "date-time" });

/** Standard error response shape — for Swagger documentation */
export const ErrorResponse = t.Object({
  error: t.Object({
    code: t.String(),
    message: t.String(),
  }),
});

/** Any JSON-encoded freeform string */
export const Metadata = t.Nullable(t.String());

/** Nullable integer */
export const NullableInt = t.Nullable(t.Number());

/** Nullable float */
export const NullableFloat = t.Nullable(t.Number());

// ═══════════════════════════════════════════════════════════════
// Enums (mirror DB constraints)
// ═══════════════════════════════════════════════════════════════

export const UserRoleEnum = t.Union([
  t.Literal("admin"),
  t.Literal("member"),
]);

// FIDE tournament systems (Handbook C.05)
export const SystemOfPlayEnum = t.Union([
  t.Literal("round-robin"),
  t.Literal("swiss"),
  t.Literal("knockout"),
  t.Literal("match"),
  t.Literal("scheveningen"),
]);

// FIDE time control categories
export const TournamentCategoryEnum = t.Union([
  t.Literal("classical"),
  t.Literal("rapid"),
  t.Literal("blitz"),
]);

// ═══════════════════════════════════════════════════════════════
// Envelope schemas
// ═══════════════════════════════════════════════════════════════

export const MetaSchema = t.Object({
  page: t.Number(),
  limit: t.Number(),
  total: t.Number(),
  totalPages: t.Number(),
});

export function DataResponse<T extends ReturnType<typeof t.Object>>(inner: T) {
  return t.Object({ data: inner });
}

export function PaginatedResponse<T extends ReturnType<typeof t.Object>>(inner: T) {
  return t.Object({
    data: t.Array(inner),
    meta: MetaSchema,
  });
}

// ═══════════════════════════════════════════════════════════════
// Common relation summary schemas (reused across resources)
// ═══════════════════════════════════════════════════════════════

export const UserSummary = t.Object({
  id: t.Number(),
  email: t.Nullable(t.String()),
  firstName: t.String(),
  lastName: t.String(),
});

export const TournamentSummary = t.Object({
  id: t.Number(),
  name: t.String(),
});

// ═══════════════════════════════════════════════════════════════
// Validación de birthDate (YYYY-MM-DD, fecha real)
// ═══════════════════════════════════════════════════════════════

export function validateBirthDate(value: string): true | string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "birthDate must be YYYY-MM-DD";
  const d = new Date(value);
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
    return `${value} is not a valid date`;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════
// Date normalization (Date → ISO string, null → null)
// ═══════════════════════════════════════════════════════════════

export function normalizeDates(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) {
    if (!Number.isFinite(obj.getTime())) {
      throw new TypeError(
        "normalizeDates: Invalid Date encountered — a handler passed an unvalidated date",
      );
    }
    return obj.toISOString();
  }
  if (Array.isArray(obj)) return obj.map(normalizeDates);
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = normalizeDates(value);
    }
    return result;
  }
  return obj;
}
