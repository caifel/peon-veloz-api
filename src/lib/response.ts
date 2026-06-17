// ═══════════════════════════════════════════════════════════════
// Tiny response helpers — keep route handlers DRY
// ═══════════════════════════════════════════════════════════════

import { normalizeDates, type Jsonified } from "./schemas";

/** Wrap a single object in { data } */
export function ok<T>(data: T) {
  return { data: normalizeDates(data) as Jsonified<T> };
}

/** 201 Created helper */
export function created<T>(data: T, set: { status?: number | string }) {
  set.status = 201;
  return { data: normalizeDates(data) as Jsonified<T> };
}

/** 204 No Content helper */
export function noContent(set: { status?: number | string }) {
  set.status = 204;
  return undefined;
}
