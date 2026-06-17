import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { defineConfig } from "drizzle-kit";

import { loadApiDatabaseConfig } from "./src/lib/db-config";

const { sqlitePath, databaseUrl } = loadApiDatabaseConfig();

mkdirSync(dirname(sqlitePath), { recursive: true });

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: databaseUrl,
  },
});
