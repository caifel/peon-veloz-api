# PeonVeloz API

REST API for chess tournament management — users and tournaments.

Built with [Elysia](https://elysiajs.com) + [Drizzle ORM](https://orm.drizzle.team) on [Bun](https://bun.sh).

## Quick Start

Docker through the `ops` project is the only supported local development path. Runtime environment values are injected by `ops/docker-compose.yml` from `ops/.env`.

```sh
cd ../ops
make up
```

Open http://localhost:4000/swagger for the interactive API docs.

Do not create `api/.env` for the supported Docker workflow. Configure local values in `ops/.env`.

## Scripts

| Script                       | Description                                                      |
| ---------------------------- | ---------------------------------------------------------------- |
| `bun run dev`                | Start dev server with hot reload inside the Docker dev container |
| `bun start`                  | Start production server                                          |
| `bun run db:generate`        | Generate the current migration snapshot from schema changes      |
| `bun run db:migrate`         | Apply the current migration snapshot                             |
| `bun run db:push`            | Push schema directly (dev only)                                  |
| `bun run db:seed`            | Seed the database with sample data                               |
| `bun run db:studio`          | Open Drizzle Studio (DB browser)                                 |
| `bun test`                   | Run the test suite                                               |
| `bun test tests/lib.test.ts` | Run a single test file                                           |

## API Docs (Swagger)

Interactive documentation is served at:

```
http://localhost:4000/swagger
```

The OpenAPI 3.0 spec is auto-generated from the `t.Object()` / `t.String()` validators defined on every route. Request bodies, query params, path params, and enum values are all documented and interactive via Scalar UI.

Public JSON request and response bodies use camelCase. Database tables and columns may use snake_case internally.

### Seed credentials

| Role  | Email                     |
| ----- | ------------------------- |
| Admin | `admin@peonveloz.com`     |
| Member | `usuario@peonveloz.com` |

## Testing

```bash
bun test              # run all tests (~2 s)
bun test --watch      # watch mode (re-run on changes)
bun test tests/lib.test.ts   # single file
```

Redis is required for testing (OAuth PKCE state storage). The test suite sets `NODE_ENV=test`.

### Structure

```
tests/
├── setup.ts              # test DB lifecycle, migration runner, HTTP helpers
├── auth.lichess.test.ts  # Lichess OAuth login flow
├── health.test.ts        # /health endpoint
├── lib.test.ts           # pagination, responses, error classes
├── lichess-oauth.test.ts # PKCE helpers
├── tournaments.test.ts   # tournament event CRUD
└── users.test.ts         # CRUD, roles, duplicates
```

Tests use an isolated `data/test.db` in WAL mode, create/clear tables per describe block, and call `app.handle()` directly — no real server needed.

## CI

GitHub Actions runs the API test suite with a Redis service, then builds the Docker image after tests pass. The workflow uses least-privilege token permissions (`contents: read`) and disables checkout credential persistence because the pipeline does not push commits, publish packages, or post PR comments.

## Docker

The production image is built from this repo's `Dockerfile`. It installs runtime dependencies, copies the API source, creates `/app/data`, and runs as the non-root `appuser` user with UID/GID `10001`.

`SQLITE_PATH` defaults to `/app/data/app.db`, so any mounted SQLite volume must be writable by UID/GID `10001`.

## Auth

Session-based authentication with CSRF protection, role-based guards, and Lichess OAuth (PKCE). See [docs/auth.md](./docs/auth.md) for the full architecture, flow diagrams, and configuration.

## Database

Uses Drizzle ORM with Bun's built-in SQLite driver.

```bash
SQLITE_PATH=./data/app.db
```

### Schema

Current tables:

- `users` — accounts (admin, member); Lichess OAuth integration
- `tournaments` — event schedule: name, date/time, location, system of play, time control, rounds, audit users
- `sessions` — auth sessions
- `health_checks` — uptime audit log
