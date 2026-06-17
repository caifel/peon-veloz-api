// ═══════════════════════════════════════════════════════════════
// Pagination helpers — parse query params & shape list responses
// ═══════════════════════════════════════════════════════════════

import { normalizeDates, type Jsonified } from "./schemas";

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Extract & sanitise pagination from query-like object (Elysia query).
 * Safe defaults prevent runaway queries.
 */
export function paginate(query: {
  page?: string | number;
  limit?: string | number;
}): PaginationParams {
  let page = Number(query.page) || DEFAULT_PAGE;
  let limit = Number(query.limit) || DEFAULT_LIMIT;

  if (page < 1) page = DEFAULT_PAGE;
  if (limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  return { page, limit, offset: (page - 1) * limit };
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Build a consistent paginated response envelope.
 */
export function paginatedResponse<T>(data: T[], meta: PageMeta) {
  return {
    data: normalizeDates(data) as Jsonified<T[]>,
    meta: {
      page: meta.page,
      limit: meta.limit,
      total: meta.total,
      totalPages: meta.totalPages,
    },
  };
}

export function pageMeta(total: number, params: PaginationParams): PageMeta {
  return {
    page: params.page,
    limit: params.limit,
    total,
    totalPages: Math.ceil(total / params.limit) || 1,
  };
}
