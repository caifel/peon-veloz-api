# PeonVeloz API

API REST para gestión de torneos de ajedrez.

```
GET /swagger
GET /swagger/json
```

Todas las respuestas usan camelCase. La base de datos usa snake_case.

---

## Autenticación

Login con **Lichess OAuth (PKCE)**. No hay email/contraseña.
Ver [`docs/auth.md`](docs/auth.md) para detalles del flujo OAuth, sesiones y CSRF.

| Método | Path | Auth | Descripción |
|--------|------|------|-------------|
| `GET` | `/auth/lichess` | No | Redirige a Lichess OAuth |
| `GET` | `/auth/lichess/callback` | No | Callback — canjea código, crea sesión |
| `POST` | `/auth/complete-profile` | Sí | Completa perfil (primer login) |
| `GET` | `/auth/me` | Sí | Usuario autenticado |
| `POST` | `/auth/logout` | Sí | Cierra sesión |
| `GET` | `/auth/csrf-token` | Sí | Token CSRF |

### `GET /auth/me`

```json
{
  "data": {
    "id": 1,
    "email": "usuario@gmail.com",
    "lichessUsername": "Mario123",
    "firstName": "Mario",
    "lastName": "Quispe",
    "role": "admin"
  }
}
```

### `POST /auth/complete-profile`

```json
{ "firstName": "Mario", "lastName": "Quispe", "phone": "+591 77777777" }
// → 200 { "data": { "message": "Profile updated" } }
```

### Roles

| Rol | Permisos |
|-----|----------|
| `admin` | CRUD completo |
| `member` | Recién registrado, acceso básico |

---

## Push Notifications

```json
POST /api/push-notification
Header: X-API-Key: <api-key>
{
  "app": "com.bcp.yape",
  "title": "Pago recibido",
  "text": "Pago Yape: 5.30 Bs - Concepto: A-47",
  "lines": [],
  "timestamp": 1718400000000,
  "notification_id": "a1b2c3d4..."
}
```

Se guardan en `notifications.txt` (una línea JSON por notificación, con `receivedAt`).

---

## Users

Solo admin.

| Método | Path | Descripción |
|--------|------|-------------|
| `GET` | `/users` | Listar (`?role=admin&search=Carlos`) |
| `GET` | `/users/:id` | Detalle |
| `POST` | `/users` | Crear |
| `PATCH` | `/users/:id` | Actualizar |
| `DELETE` | `/users/:id` | Soft-delete |

---

## Tournaments

| Método | Path | Auth | Descripción |
|--------|------|------|-------------|
| `GET` | `/tournaments` | No | Listar (`?search=Copa&category=blitz&systemOfPlay=swiss`) |
| `GET` | `/tournaments/:id` | Sí | Detalle con usuarios de auditoría |
| `POST` | `/tournaments` | Admin | Crear |
| `PATCH` | `/tournaments/:id` | Admin | Actualizar |
| `DELETE` | `/tournaments/:id` | Admin | Eliminar |

---

## Health

```
GET /health
→ { "status": "ok", "dependencies": { "sqlite": "ok", "redis": "ok" } }
```

---

## Variables de entorno

| Variable | Requerida | Default | Descripción |
|----------|:---------:|---------|-------------|
| `HOST` | Sí | — | Host del servidor (ej: `0.0.0.0`) |
| `PORT` | Sí | — | Puerto del servidor (ej: `4000`) |
| `SQLITE_PATH` | Sí | — | Ruta al archivo SQLite (ej: `./data/app.db`) |
| `FRONTEND_URL` | Sí | — | URL del frontend para CORS y redirects OAuth |
| `CSRF_SECRET` | Sí | — | Clave HMAC para firmar tokens CSRF |
| `NODE_ENV` | No | `development` | Entorno (`development`, `test`, `production`). En `production` activa cookie `Secure` |
| `REDIS_URL` | No | `redis://localhost:6379` | Conexión Redis para OAuth state y rate limiting |
| `DATABASE_URL` | No | `file:<SQLITE_PATH>` | URL SQLite explícita (alternativa a SQLITE_PATH) |
| `LICHESS_CLIENT_ID` | No | `peonveloz` | Client ID para Lichess OAuth |
| `PUSH_NOTIFICATION_API_KEY` | No | `""` | API key para validar notificaciones push |

---

## Desarrollo

```sh
bun install
bun run dev       # servidor con hot reload en :4000
bun test          # tests
bun run db:seed   # datos de prueba
```
