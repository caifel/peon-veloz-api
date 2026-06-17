# Auth

Autenticación con Lichess OAuth (PKCE), sesiones HttpOnly, CSRF protection, y role guards.

## Flujo de autenticación

```
Navegador                        API                           Lichess
  │                               │                               │
  │  GET /auth/lichess            │                               │
  │ ────────────────────────────► │                               │
  │                               │  genera PKCE code_verifier    │
  │                               │  guarda en Redis (TTL 10min)  │
  │  302 → lichess.org/oauth      │                               │
  │ ◄──────────────────────────── │                               │
  │                               │                               │
  │  Usuario autoriza ─────────────────────────────────────────► │
  │                               │                               │
  │  302 → /auth/lichess/callback │                               │
  │  ?code=...&state=...          │                               │
  │ ────────────────────────────► │                               │
  │                               │  recupera code_verifier       │
  │                               │  POST /api/token ───────────► │
  │                               │  ◄──── { access_token }       │
  │                               │  GET /api/account ──────────► │
  │                               │  ◄── { id, username, email }  │
  │                               │                               │
  │                               │  find-or-create user (SQLite) │
  │                               │  signIn(userId) → session     │
  │                               │                               │
  │  Set-Cookie: session=<token>  │                               │
  │  302 → /dashboard o /complete-profile                        │
  │ ◄──────────────────────────── │                               │
```

### OAuth sin client_secret

Lichess deprecó `client_secret` en 2021. El flujo actual usa **PKCE** (Proof Key for Code Exchange):

| Campo | Valor |
|-------|-------|
| `client_id` | Fijo: `peonveloz` (arbitrario, Lichess no lo valida) |
| `client_secret` | No se usa |
| `code_challenge_method` | `S256` (SHA-256) |
| `code_verifier` | 32 bytes aleatorios, base64url |
| `code_challenge` | SHA-256 del verifier, base64url |
| `scope` | `email:read` |
| Estado OAuth | UUID aleatorio, guardado en Redis con TTL de 10 minutos |

### Endpoints

| Método | Path | Auth | Descripción |
|--------|------|------|-------------|
| `GET` | `/auth/lichess` | No | Inicia OAuth. Genera PKCE, guarda verifier en Redis, redirige a Lichess. |
| `GET` | `/auth/lichess/callback` | No | Callback. Canjea código por token, obtiene cuenta Lichess, crea/encuentra user, inicia sesión. Redirige a `/complete-profile` (primer login) o `/dashboard`. |
| `POST` | `/auth/complete-profile` | Sí | Completa firstName, lastName, phone tras primer login. |
| `GET` | `/auth/me` | Sí | Retorna datos del usuario autenticado. |
| `POST` | `/auth/logout` | Sí | Revoca la sesión, limpia la cookie. |
| `GET` | `/auth/csrf-token` | Sí | Genera token CSRF para mutaciones. |

## Sesiones

**`src/lib/auth.ts`**

- Token: `crypto.randomUUID()` — solo el hash SHA-256 se guarda en `sessions`
- Cookie: `session=<token>` — HttpOnly, SameSite=Lax, Path=/
- En producción: prefijo `__Host-` + flag `Secure`
- Duración: **7 días** con refresh automático al pasar el 50% de vida
- Logout: soft-delete (`revokedAt`)

### Cookie flags

| Flag | Dev/Test | Production |
|------|----------|------------|
| HttpOnly | ✅ | ✅ |
| Secure | ❌ | ✅ |
| SameSite | Lax | Lax |
| Path | / | / |
| Max-Age | 604800 (7d) | 604800 (7d) |

### Helpers

```ts
await signIn(userId);   // crea sesión, setea cookie
await signOut();         // revoca sesión, limpia cookie
```

### Guards

```ts
requireAuth              // → 401 si no hay sesión
requireRole("admin")     // → 403 si el rol no coincide
```

## CSRF Protection

**`src/lib/csrf.ts`**

Todas las mutaciones (POST, PUT, PATCH, DELETE) requieren header `X-CSRF-Token` vinculado a la sesión.

- **Formato**: `base64url(sessionHash:expiry).base64url(HMAC-SHA256)`
- **Vida**: 1 hora
- **Verificación**: HMAC → binding de sesión → expiración
- **Comparación timing-safe**: XOR constante

Rutas exentas: `POST /auth/logout`, `GET /auth/lichess/callback`, `POST /api/push-notification`.

## Roles

| Rol | Cómo se obtiene | Capacidades |
|-----|----------------|-------------|
| `member` | Auto-registro vía Lichess (rol por defecto) | Acceso básico, perfil propio |
| `admin` | Configuración inicial / seed | CRUD completo, users, tournaments |

## Primer login — complete profile

Cuando un usuario inicia sesión por primera vez:

1. Se crea el user con `firstName = lichessUsername` y `lastName = ""`
2. El callback detecta `lastName` vacío y redirige a `/complete-profile`
3. El frontend muestra el formulario: firstName, lastName, phone, birthDate (opcional), gender (opcional)
4. `POST /auth/complete-profile` actualiza los campos

Logins subsiguientes redirigen directo a `/dashboard`.

## Modelo

```
users
  ├── id, lichessId (unique), lichessUsername
  ├── email, firstName, lastName, phone
  ├── birthDate, gender, address
  ├── role, isActive
  └── createdAt, updatedAt

sessions
  ├── id, userId → users.id
  ├── tokenHash (SHA-256 del token)
  ├── expiresAt, revokedAt
  └── createdAt
```

## Redis

| Key | Valor | TTL | Uso |
|-----|-------|-----|-----|
| `lichess_oauth:<state>` | code_verifier | 10 min | Callback recupera el verifier para canjear el código |

Si Redis no está disponible, el flujo OAuth falla. El health check monitorea la conexión.

## Variables de entorno

| Variable | Requerida | Default | Propósito |
|----------|-----------|---------|-----------|
| `FRONTEND_URL` | Sí | — | URL del frontend para redirects OAuth y CORS |
| `CSRF_SECRET` | Sí | — | Clave HMAC para firmar tokens CSRF |
| `REDIS_URL` | No | `redis://localhost:6379` | Redis para almacenar code_verifier del OAuth |
| `NODE_ENV` | No | `development` | Controla flags de cookie (Secure en production) |
| `LICHESS_CLIENT_ID` | No | `peonveloz` | Client ID para Lichess OAuth |

## Archivos

| Archivo | Responsabilidad |
|---------|----------------|
| `src/lib/auth.ts` | Sesiones, cookies, plugin `currentUser`, guards |
| `src/lib/csrf.ts` | Tokens CSRF |
| `src/lib/lichess-oauth.ts` | PKCE, token exchange, find-or-create user |
| `src/lib/security.ts` | CORS, verificación CSRF en mutaciones |
| `src/lib/errors.ts` | `Unauthorized`, `Forbidden`, `BadRequest` |
| `src/lib/redis.ts` | Cliente Redis singleton |
| `src/routes/auth.ts` | Endpoints de auth |
| `src/db/schema.ts` | Tablas `users` y `sessions` |
