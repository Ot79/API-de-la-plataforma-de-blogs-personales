# API de la plataforma de blogs personales

[![CI](https://github.com/Ot79/API-de-la-plataforma-de-blogs-personales/actions/workflows/ci.yml/badge.svg)](https://github.com/Ot79/API-de-la-plataforma-de-blogs-personales/actions/workflows/ci.yml)
![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

API REST para una plataforma de blogs personales, construida con **Node.js, TypeScript, Express 5, Prisma 7 y PostgreSQL**. Parte del proyecto [Personal Blogging Platform API de roadmap.sh](https://roadmap.sh/backend/project-ideas#1-personal-blogging-platform-api) y lo amplía hasta un servicio listo para producción: autenticación JWT con rotación de refresh tokens, roles, borradores, etiquetas, categorías, comentarios, búsqueda, paginación, documentación OpenAPI, Docker y CI.

## Índice

- [Características](#características)
- [Stack](#stack)
- [Inicio rápido](#inicio-rápido)
- [Variables de entorno](#variables-de-entorno)
- [Endpoints](#endpoints)
- [Ejemplos de uso](#ejemplos-de-uso)
- [Formato de respuestas y errores](#formato-de-respuestas-y-errores)
- [Modelo de datos](#modelo-de-datos)
- [Arquitectura](#arquitectura)
- [Decisiones de diseño](#decisiones-de-diseño)
- [Despliegue en Render](#despliegue-en-render)
- [Tests y calidad](#tests-y-calidad)
- [Scripts](#scripts)
- [Relación con el enunciado de roadmap.sh](#relación-con-el-enunciado-de-roadmapsh)

## Características

**Requisitos del enunciado original**

- CRUD completo de artículos: crear, leer uno, listar, actualizar y eliminar.
- Búsqueda por término (`?term=`) en título, contenido, categoría y etiquetas.
- Códigos HTTP correctos: `201` + `Location` al crear, `204` al borrar, `400` en validación, `404` si no existe.

**Ampliaciones**

- **Autenticación JWT**: access tokens de vida corta y refresh tokens opacos con **rotación y detección de reutilización** (si alguien reutiliza un token ya rotado, se cierran todas las sesiones del usuario).
- **Autorización por propietario y roles** (`USER` / `ADMIN`): solo el autor o un administrador pueden modificar un artículo.
- **Ciclo de vida editorial**: `DRAFT` → `PUBLISHED` → `ARCHIVED`, con `publishedAt` gestionado automáticamente. Los borradores son invisibles para otros usuarios (responden `404`, no `403`, para no revelar su existencia).
- **Slugs únicos** legibles (`/articles/mi-primer-articulo`), resistentes a peticiones concurrentes y estables una vez publicado el artículo.
- **Extracto y tiempo de lectura** calculados automáticamente a partir del Markdown.
- **Filtros combinables**: etiquetas, categoría, autor, estado, rango de fechas, ordenación y paginación.
- **Comentarios** con moderación: los borra su autor, el autor del artículo o un admin.
- **Perfiles públicos**, edición de perfil, cambio de contraseña (revoca todas las sesiones) y gestión de roles.
- **Documentación OpenAPI 3.1** generada desde los mismos esquemas Zod que validan las peticiones, con Swagger UI en `/docs`.
- **Seguridad**: Helmet, CORS configurable, rate limiting (más estricto en login/registro), bcrypt, límite de tamaño del body, protección contra enumeración de usuarios en el login.
- **Observabilidad**: logs estructurados con pino, `X-Request-Id` propagado en respuestas y errores, health checks de liveness y readiness.
- **Operación**: validación de variables de entorno al arrancar, apagado ordenado (SIGTERM), imagen Docker multi-stage sin privilegios, `docker compose` con migraciones automáticas y CI en GitHub Actions.

## Stack

| Capa          | Tecnología                                                 |
| ------------- | ---------------------------------------------------------- |
| Runtime       | Node.js 22, TypeScript 5.9 (ESM)                           |
| HTTP          | Express 5, Helmet, CORS, express-rate-limit                |
| Base de datos | PostgreSQL 16, Prisma ORM 7 (driver adapter `pg`)          |
| Validación    | Zod 4                                                      |
| Auth          | jsonwebtoken (HS256), bcryptjs                             |
| Documentación | OpenAPI 3.1 (`@asteasolutions/zod-to-openapi`), Swagger UI |
| Logs          | pino, pino-http                                            |
| Tests         | Vitest, Supertest, cobertura v8                            |
| Tooling       | ESLint (typescript-eslint), Prettier, tsup, tsx            |
| Infra         | Docker, Docker Compose, GitHub Actions, Dependabot         |

## Inicio rápido

### Opción A: Docker Compose (recomendada)

Solo necesitas Docker.

```bash
git clone https://github.com/Ot79/API-de-la-plataforma-de-blogs-personales.git
cd API-de-la-plataforma-de-blogs-personales
cp .env.example .env            # cambia JWT_ACCESS_SECRET por un valor aleatorio
docker compose up --build
```

Compose levanta PostgreSQL, aplica las migraciones (servicio `migrate`) y arranca la API en <http://localhost:3000>. La documentación interactiva queda en <http://localhost:3000/docs>.

### Opción B: entorno local

Requisitos: Node.js ≥ 20.19 (recomendado 22, ver `.nvmrc`) y PostgreSQL 14+.

```bash
npm install                     # también genera el cliente de Prisma
cp .env.example .env            # ajusta DATABASE_URL y JWT_ACCESS_SECRET
npm run db:deploy               # aplica las migraciones
npm run db:seed                 # opcional: datos de ejemplo
npm run dev                     # servidor con recarga en caliente
```

Si solo quieres la base de datos en Docker: `docker compose up -d db`.

El seed crea tres usuarios con la contraseña `Passw0rd!`: `admin@example.com` (ADMIN), `ada@example.com` (autora de los artículos) y `linus@example.com`.

## Variables de entorno

Se validan al arrancar; si alguna es inválida la aplicación no inicia y muestra qué falla.

| Variable                 | Por defecto   | Descripción                                                  |
| ------------------------ | ------------- | ------------------------------------------------------------ |
| `NODE_ENV`               | `development` | `development`, `test` o `production`                         |
| `PORT`                   | `3000`        | Puerto HTTP                                                  |
| `DATABASE_URL`           | (obligatoria) | Cadena de conexión PostgreSQL                                |
| `JWT_ACCESS_SECRET`      | (obligatoria) | Secreto HS256, mínimo 32 caracteres                          |
| `JWT_ACCESS_EXPIRES_IN`  | `15m`         | Validez del access token (`900`, `15m`, `1h`, `1d`...)       |
| `REFRESH_TOKEN_TTL_DAYS` | `7`           | Días de validez del refresh token                            |
| `CORS_ORIGIN`            | `*`           | Orígenes permitidos separados por coma                       |
| `RATE_LIMIT_WINDOW_MS`   | `900000`      | Ventana del rate limiting (ms)                               |
| `RATE_LIMIT_MAX`         | `300`         | Peticiones por IP y ventana en `/api/v1`                     |
| `AUTH_RATE_LIMIT_MAX`    | `20`          | Peticiones por IP y ventana en registro, login y refresh     |
| `LOG_LEVEL`              | `info`        | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` |

## Endpoints

Todas las rutas de negocio cuelgan de `/api/v1`. 🔒 indica que requiere `Authorization: Bearer <accessToken>`; 🔓 que el token es opcional y amplía lo que se ve.

| Método   | Ruta                          | Descripción                                            |
| -------- | ----------------------------- | ------------------------------------------------------ |
| `POST`   | `/auth/register`              | Registrar usuario (devuelve usuario y tokens)          |
| `POST`   | `/auth/login`                 | Iniciar sesión                                         |
| `POST`   | `/auth/refresh`               | Rotar refresh token y obtener nuevo access token       |
| `POST`   | `/auth/logout`                | Revocar un refresh token                               |
| `GET`    | `/auth/me`                    | 🔒 Usuario autenticado                                 |
| `PATCH`  | `/users/me`                   | 🔒 Editar nombre visible y biografía                   |
| `PUT`    | `/users/me/password`          | 🔒 Cambiar contraseña (cierra todas las sesiones)      |
| `GET`    | `/users/:username`            | Perfil público con número de artículos publicados      |
| `PATCH`  | `/users/:username/role`       | 🔒 ADMIN: cambiar el rol de un usuario                 |
| `GET`    | `/articles`                   | 🔓 Listar con búsqueda, filtros y paginación           |
| `POST`   | `/articles`                   | 🔒 Crear artículo                                      |
| `GET`    | `/articles/:idOrSlug`         | 🔓 Obtener por UUID o slug                             |
| `PUT`    | `/articles/:id`               | 🔒 Reemplazar artículo completo (autor o ADMIN)        |
| `PATCH`  | `/articles/:id`               | 🔒 Actualizar campos concretos (autor o ADMIN)         |
| `DELETE` | `/articles/:id`               | 🔒 Eliminar (autor o ADMIN)                            |
| `GET`    | `/articles/:id/comments`      | 🔓 Listar comentarios (paginado)                       |
| `POST`   | `/articles/:id/comments`      | 🔒 Comentar un artículo publicado                      |
| `PATCH`  | `/comments/:id`               | 🔒 Editar comentario propio                            |
| `DELETE` | `/comments/:id`               | 🔒 Borrar (autor del comentario, del artículo o ADMIN) |
| `GET`    | `/tags`                       | Etiquetas con artículos publicados, por popularidad    |
| `GET`    | `/categories`                 | Categorías con su número de artículos publicados       |
| `GET`    | `/health`, `/health/ready`    | Liveness y readiness (comprueba la base de datos)      |
| `GET`    | `/docs`, `/docs/openapi.json` | Swagger UI y especificación OpenAPI                    |

### Parámetros de `GET /articles`

| Parámetro                       | Ejemplo                    | Descripción                                                                              |
| ------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------- |
| `term`                          | `term=postgres`            | Búsqueda sin distinguir mayúsculas en título, extracto, contenido, categoría y etiquetas |
| `tags`                          | `tags=node-js,api`         | Slugs de etiquetas separados por coma (coincide con cualquiera)                          |
| `category`                      | `category=backend`         | Slug de categoría                                                                        |
| `author`                        | `author=ada`               | Username del autor                                                                       |
| `publishedFrom` / `publishedTo` | `publishedFrom=2026-01-01` | Rango de publicación; una fecha sin hora en `publishedTo` incluye el día entero          |
| `mine`                          | `mine=true`                | 🔒 Solo tus artículos, en cualquier estado                                               |
| `status`                        | `status=DRAFT`             | Filtra por estado con `mine=true` o como ADMIN; el público solo ve `PUBLISHED`           |
| `sort` / `order`                | `sort=title&order=asc`     | `publishedAt` (defecto), `createdAt`, `updatedAt`, `title` / `asc`, `desc`               |
| `page` / `limit`                | `page=2&limit=20`          | Paginación (`limit` máximo 100, defecto 10)                                              |

El listado devuelve resúmenes sin el campo `content` para mantener las respuestas ligeras; el detalle (`GET /articles/:idOrSlug`) incluye el contenido completo.

## Ejemplos de uso

```bash
# Registro
curl -s -X POST http://localhost:3000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"ada@example.com","username":"ada","password":"Passw0rd!"}'

# Login: guarda el access token
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"ada@example.com","password":"Passw0rd!"}' | jq -r .data.tokens.accessToken)

# Crear un artículo publicado
curl -s -X POST http://localhost:3000/api/v1/articles \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{
        "title": "Mi primer artículo",
        "content": "## Hola\n\nContenido en **Markdown**.",
        "category": "Tecnología",
        "tags": ["Node.js", "API"],
        "status": "PUBLISHED"
      }'

# Buscar
curl -s 'http://localhost:3000/api/v1/articles?term=node&tags=api&page=1&limit=5'
```

En [`docs/requests.http`](docs/requests.http) hay una colección completa de peticiones para REST Client (VS Code) o los clientes HTTP de JetBrains.

## Formato de respuestas y errores

Respuesta de un recurso:

```json
{
  "data": {
    "id": "0359b988-260f-40eb-b834-b28c309503ed",
    "title": "Mi primer artículo",
    "slug": "mi-primer-articulo",
    "excerpt": "Hola Contenido en Markdown.",
    "content": "## Hola\n\nContenido en **Markdown**.",
    "status": "PUBLISHED",
    "readingTimeMinutes": 1,
    "publishedAt": "2026-10-03T17:03:19.334Z",
    "createdAt": "2026-10-03T17:03:19.334Z",
    "updatedAt": "2026-10-03T17:03:19.343Z",
    "author": { "id": "d79e...", "username": "ada", "displayName": "Ada Lovelace" },
    "category": { "name": "Tecnología", "slug": "tecnologia" },
    "tags": [
      { "name": "API", "slug": "api" },
      { "name": "Node.js", "slug": "node-js" }
    ],
    "commentCount": 0
  }
}
```

Listados paginados:

```json
{
  "data": [],
  "meta": { "page": 1, "limit": 10, "total": 42, "totalPages": 5 }
}
```

Todos los errores comparten forma y llevan el `requestId`, que también aparece en la cabecera `X-Request-Id` y en los logs:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Datos de entrada inválidos",
    "details": [{ "path": "title", "message": "Mínimo 3 caracteres" }],
    "requestId": "7f9c1f3e-3b8e-4c63-9f5a-0f6b1d2c3a4e"
  }
}
```

| Código              | HTTP | Cuándo                                                   |
| ------------------- | ---- | -------------------------------------------------------- |
| `VALIDATION_ERROR`  | 400  | El body, la query o los parámetros no cumplen el esquema |
| `BAD_REQUEST`       | 400  | JSON mal formado u operación no válida                   |
| `UNAUTHORIZED`      | 401  | Falta el token, es inválido o ha expirado                |
| `FORBIDDEN`         | 403  | Autenticado pero sin permisos sobre el recurso           |
| `NOT_FOUND`         | 404  | El recurso no existe o no es visible para ti             |
| `CONFLICT`          | 409  | Email o username ya registrados                          |
| `PAYLOAD_TOO_LARGE` | 413  | Body mayor de 1 MB                                       |
| `TOO_MANY_REQUESTS` | 429  | Se superó el rate limit                                  |
| `INTERNAL_ERROR`    | 500  | Error inesperado (el detalle solo queda en los logs)     |

## Modelo de datos

```mermaid
erDiagram
    USER ||--o{ ARTICLE : escribe
    USER ||--o{ COMMENT : escribe
    USER ||--o{ REFRESH_TOKEN : tiene
    ARTICLE ||--o{ COMMENT : recibe
    ARTICLE }o--o| CATEGORY : pertenece
    ARTICLE ||--o{ ARTICLE_TAG : ""
    TAG ||--o{ ARTICLE_TAG : ""

    USER {
        uuid id PK
        string email UK
        string username UK
        string password_hash
        string display_name
        string bio
        enum role "USER | ADMIN"
    }
    ARTICLE {
        uuid id PK
        string title
        string slug UK
        string excerpt
        text content
        enum status "DRAFT | PUBLISHED | ARCHIVED"
        int reading_time_minutes
        timestamp published_at
        uuid author_id FK
        uuid category_id FK
    }
    CATEGORY {
        uuid id PK
        string name UK
        string slug UK
    }
    TAG {
        uuid id PK
        string name UK
        string slug UK
    }
    ARTICLE_TAG {
        uuid article_id PK, FK
        uuid tag_id PK, FK
    }
    COMMENT {
        uuid id PK
        text content
        uuid article_id FK
        uuid author_id FK
    }
    REFRESH_TOKEN {
        uuid id PK
        string token_hash UK
        timestamp expires_at
        timestamp revoked_at
        uuid user_id FK
    }
```

Las etiquetas y categorías se crean al vuelo al publicar (se normalizan por slug, así que `Node.js` y `node js` son la misma etiqueta). Hay índices para filtrar por `(status, published_at)`, autor, categoría y etiqueta.

## Arquitectura

Organización por módulos de dominio; cada uno separa rutas, controlador (HTTP), servicio (lógica de negocio y acceso a datos) y esquemas Zod.

```
src/
├── app.ts                 # Composición de Express: middlewares, rutas y errores
├── server.ts              # Arranque y apagado ordenado
├── config/env.ts          # Variables de entorno validadas con Zod
├── docs/openapi.ts        # Especificación OpenAPI generada desde los esquemas
├── lib/                   # Prisma, logger, errores, JWT, slugs, paginación...
├── middlewares/           # Autenticación, rate limiting, manejo de errores
└── modules/
    ├── auth/              # Registro, login, refresh, logout
    ├── users/             # Perfiles, contraseña y roles
    ├── articles/          # CRUD, filtros y reglas de visibilidad
    ├── comments/          # Comentarios y moderación
    ├── taxonomy/          # Etiquetas y categorías
    └── health/            # Liveness y readiness
prisma/
├── schema.prisma          # Modelo de datos
├── migrations/            # Migraciones SQL versionadas
└── seed.ts                # Datos de ejemplo
tests/
├── unit/                  # Utilidades puras
└── integration/           # API completa contra PostgreSQL real
```

## Decisiones de diseño

- **Refresh tokens opacos y hasheados.** Se guardan como SHA-256 en base de datos, nunca en claro. Cada uso los rota; la rotación usa un `UPDATE ... WHERE revoked_at IS NULL` condicionado para que dos peticiones simultáneas no puedan rotar el mismo token. Presentar un token ya revocado se trata como robo y revoca todas las sesiones del usuario.
- **Login sin enumeración de usuarios.** Si el email no existe se compara igualmente contra un hash ficticio del mismo coste, de modo que la respuesta y su tiempo son iguales en ambos casos.
- **PUT frente a PATCH.** `PUT` reemplaza el recurso: los campos opcionales omitidos vuelven a su valor por defecto (sin etiquetas, sin categoría, `DRAFT`). `PATCH` solo modifica lo enviado.
- **Slugs estables.** El slug se regenera al cambiar el título solo mientras el artículo no se ha publicado nunca, para no romper enlaces ya compartidos. Si dos peticiones concurrentes calculan el mismo slug, la restricción única de la base de datos lo detecta y se reintenta con un sufijo aleatorio.
- **404 en lugar de 403 para borradores ajenos.** Evita revelar que existe un artículo no publicado.
- **Los listados no incluyen `content`.** Reduce drásticamente el tamaño de las respuestas; el contenido se obtiene en el detalle.
- **Esquemas Zod como única fuente de verdad.** Los mismos esquemas validan las peticiones, generan los tipos TypeScript y producen la documentación OpenAPI, así que la documentación no puede quedarse desfasada respecto a la validación.
- **El rol viaja en el access token.** Al cambiar el rol de un usuario se revocan sus refresh tokens; el cambio se aplica como tarde cuando expira el access token actual (15 minutos por defecto).
- **`trust proxy = 1`.** Pensado para desplegarse detrás de un proxy inverso o balanceador, de forma que el rate limiting use la IP real del cliente.

## Despliegue en Render

El repositorio incluye un [Blueprint de Render](render.yaml) que crea la API y una base de datos PostgreSQL en el plan gratuito.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Ot79/API-de-la-plataforma-de-blogs-personales)

1. En el [dashboard de Render](https://dashboard.render.com), elige **New → Blueprint** y conecta este repositorio (o usa el botón anterior).
2. Render lee `render.yaml`, crea la base de datos `blogging-platform-db` y el servicio `blogging-platform-api`, conecta `DATABASE_URL` y genera un `JWT_ACCESS_SECRET` aleatorio.
3. Cada arranque aplica las migraciones pendientes (`npm run db:deploy`) antes de servir tráfico, y el health check usa `/health/ready`.
4. Los despliegues posteriores se lanzan solos con cada push a `main` cuyo CI pase.

Para cargar los datos de ejemplo en producción, ejecuta una vez en la shell del servicio: `SEED_FORCE=true npm run db:seed` (borra los datos existentes).

Limitaciones del plan gratuito: el servicio se suspende tras 15 minutos sin tráfico (la primera petición tarda unos segundos en despertarlo) y la base de datos gratuita caduca a los 30 días. Para un uso permanente cambia `plan` en `render.yaml` a un plan de pago.

## Tests y calidad

```bash
# Crea la base de datos de test una sola vez
createdb blog_test                       # o: docker compose exec db createdb -U postgres blog_test

npm test                                 # unitarios + integración
npm run test:coverage                    # con informe de cobertura en coverage/
```

Los tests de integración levantan la aplicación con Supertest contra PostgreSQL real: aplican las migraciones antes de la suite y vacían las tablas antes de cada test. La URL se puede cambiar con `TEST_DATABASE_URL` (por defecto `postgresql://postgres:postgres@localhost:5432/blog_test`).

La suite tiene **91 tests** y una cobertura de líneas superior al 90 %. Cubre, entre otros, la rotación y reutilización de refresh tokens, la visibilidad de borradores, permisos de autor/admin, cada filtro del listado, la semántica de PUT/PATCH, las transiciones de `publishedAt` y la creación concurrente de artículos con el mismo título.

En cada push y pull request, GitHub Actions ejecuta formato, lint, typecheck, tests con PostgreSQL, build y la construcción de la imagen Docker.

## Scripts

| Script                  | Descripción                                   |
| ----------------------- | --------------------------------------------- |
| `npm run dev`           | Servidor de desarrollo con recarga (tsx)      |
| `npm run build`         | Compila a `dist/` con tsup                    |
| `npm start`             | Ejecuta la build de producción                |
| `npm test`              | Ejecuta la suite de tests                     |
| `npm run test:coverage` | Tests con cobertura                           |
| `npm run lint`          | ESLint                                        |
| `npm run typecheck`     | Comprobación de tipos                         |
| `npm run format`        | Formatea con Prettier                         |
| `npm run db:migrate`    | Crea/aplica migraciones en desarrollo         |
| `npm run db:deploy`     | Aplica migraciones pendientes (producción/CI) |
| `npm run db:seed`       | Carga datos de ejemplo (borra los existentes) |
| `npm run db:generate`   | Regenera el cliente de Prisma                 |

## Relación con el enunciado de roadmap.sh

| Enunciado original                            | Esta API                                                                    |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| `POST /posts`                                 | `POST /api/v1/articles` (requiere autenticación)                            |
| `PUT /posts/:id`                              | `PUT /api/v1/articles/:id` (+ `PATCH` parcial)                              |
| `DELETE /posts/:id`                           | `DELETE /api/v1/articles/:id`                                               |
| `GET /posts/:id`                              | `GET /api/v1/articles/:idOrSlug`                                            |
| `GET /posts`                                  | `GET /api/v1/articles` (paginado)                                           |
| `GET /posts?term=tech`                        | `GET /api/v1/articles?term=tech`                                            |
| Campos `title`, `content`, `category`, `tags` | Iguales, más `excerpt`, `status`, `slug`, autor, tiempo de lectura y fechas |

Se usa "articles" en lugar de "posts" y un prefijo de versión (`/api/v1`) para poder evolucionar la API sin romper clientes.

## Licencia

[MIT](LICENSE)
