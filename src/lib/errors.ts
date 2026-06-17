import { Elysia } from "elysia";
import { logger } from "./logger";
import { getRequestPath } from "./request-context";

// ═══════════════════════════════════════════════════════════════
// Typed application errors with HTTP status codes
// ═══════════════════════════════════════════════════════════════

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

/** 400 — Client provided bad input */
export class BadRequest extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, "BAD_REQUEST", message, details);
  }
}

/** 404 — Resource not found */
export class NotFound extends AppError {
  constructor(message = "Resource not found") {
    super(404, "NOT_FOUND", message);
  }
}

/** 409 — Conflict (e.g. duplicate email, unique constraint) */
export class Conflict extends AppError {
  constructor(message: string) {
    super(409, "CONFLICT", message);
  }
}

/** 401 — Authentication required */
export class Unauthorized extends AppError {
  constructor(message = "Authentication required") {
    super(401, "UNAUTHORIZED", message);
  }
}

/** 403 — Authenticated but lacking required role */
export class Forbidden extends AppError {
  constructor(message = "Insufficient permissions") {
    super(403, "FORBIDDEN", message);
  }
}

/** 429 — Rate limit exceeded */
export class TooManyRequests extends AppError {
  constructor(message = "Too many requests", retryAfter?: number) {
    super(429, "TOO_MANY_REQUESTS", message, retryAfter ? { retryAfter } : undefined);
  }
}

// ═══════════════════════════════════════════════════════════════
// Global Elysia error handler plugin — produces consistent JSON
// ═══════════════════════════════════════════════════════════════

export const errorHandler = new Elysia({ name: "error-handler" }).onError(
  { as: "global" },
  ({ code, error, request, set }) => {
    const baseLogContext = {
      method: request.method,
      path: getRequestPath(request),
    };

    // Our custom AppError → use its structured fields
    if (error instanceof AppError) {
      set.status = error.statusCode;
      logger[error.statusCode === 404 ? "info" : "warn"]("Handled application error", {
        ...baseLogContext,
        status: error.statusCode,
        code: error.code,
        errorMessage: error.message,
      });

      return {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      };
    }

    // Elysia validation errors → normalize to 400
    if (code === "VALIDATION") {
      set.status = 400;
      logger.warn("Request validation failed", {
        ...baseLogContext,
        status: 400,
        code: "VALIDATION_ERROR",
      });

      return {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request payload",
        },
      };
    }

    // Not-found route fallback
    if (code === "NOT_FOUND") {
      set.status = 404;
      logger.info("Route not found", {
        ...baseLogContext,
        status: 404,
        code: "NOT_FOUND",
      });

      return {
        error: {
          code: "NOT_FOUND",
          message: "The requested endpoint does not exist",
        },
      };
    }

    // Everything else → 500
    set.status = 500;
    logger.error("Unhandled request error", {
      ...baseLogContext,
      status: 500,
      code,
      error,
    });

    return {
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
      },
    };
  },
);
