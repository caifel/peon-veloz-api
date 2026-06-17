type LogLevel = "info" | "warn" | "error";
type LogContext = Record<string, unknown>;

function normalize(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  return value;
}

function write(level: LogLevel, message: string, context: LogContext = {}) {
  const entry: LogContext = {
    timestamp: new Date().toISOString(),
    level,
    service: "api",
    message,
  };

  for (const [key, value] of Object.entries(context)) {
    const field = key in entry ? `context_${key}` : key;
    entry[field] = normalize(value);
  }

  const line = JSON.stringify(entry);

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.info(line);
}

export const logger = {
  info: (message: string, context?: LogContext) => write("info", message, context),
  warn: (message: string, context?: LogContext) => write("warn", message, context),
  error: (message: string, context?: LogContext) => write("error", message, context),
};
