import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";

import { loadApiDatabaseConfig } from "../lib/db-config";
import * as schema from "./schema";

const { sqlitePath } = loadApiDatabaseConfig();

mkdirSync(dirname(sqlitePath), { recursive: true });

const sqlite = new Database(sqlitePath);

// SQLite has foreign key enforcement OFF by default — must enable explicitly
sqlite.run("PRAGMA foreign_keys = ON;");
// WAL mode allows concurrent reads during writes, preventing
// write-locks from blocking other requests (e.g. login INSERT
// won't freeze ongoing GET handlers).
sqlite.run("PRAGMA journal_mode = WAL;");

export const db = drizzle({ client: sqlite, schema });
