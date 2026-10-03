import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  type ResponseConfig,
  type RouteConfig,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

import {
  articleIdParams,
  articleLookupParams,
  articleSchema,
  articleSummarySchema,
  createArticleBody,
  listArticlesQuery,
  replaceArticleBody,
  updateArticleBody,
} from '../modules/articles/articles.schemas';
import {
  authResultSchema,
  loginBody,
  refreshBody,
  registerBody,
} from '../modules/auth/auth.schemas';
import {
  commentBody,
  commentIdParams,
  commentSchema,
  listCommentsQuery,
} from '../modules/comments/comments.schemas';
import { categoryWithCountSchema, tagWithCountSchema } from '../modules/taxonomy/taxonomy.schemas';
import {
  changePasswordBody,
  changeRoleBody,
  privateUserSchema,
  publicUserSchema,
  updateProfileBody,
  userProfileSchema,
  usernameParams,
} from '../modules/users/users.schemas';

const registry = new OpenAPIRegistry();

const bearerAuth = registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});
const secured = [{ [bearerAuth.name]: [] }];

const errorSchema = z
  .object({
    error: z.object({
      code: z.string().meta({ example: 'VALIDATION_ERROR' }),
      message: z.string().meta({ example: 'Datos de entrada inválidos' }),
      details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
      requestId: z.string().meta({ example: '7f9c1f3e-3b8e-4c63-9f5a-0f6b1d2c3a4e' }),
    }),
  })
  .meta({ id: 'Error' });

const pageMetaSchema = z
  .object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  })
  .meta({ id: 'PageMeta' });

const json = (schema: z.ZodType, description: string): ResponseConfig => ({
  description,
  content: { 'application/json': { schema } },
});
const data = (schema: z.ZodType, description: string) =>
  json(z.object({ data: schema }), description);
const page = (schema: z.ZodType, description: string) =>
  json(z.object({ data: z.array(schema), meta: pageMetaSchema }), description);
const jsonBody = (schema: z.ZodType) => ({ content: { 'application/json': { schema } } });

const errors = {
  400: json(errorSchema, 'Petición inválida o error de validación'),
  401: json(errorSchema, 'No autenticado o token inválido'),
  403: json(errorSchema, 'Sin permisos'),
  404: json(errorSchema, 'Recurso no encontrado'),
  409: json(errorSchema, 'Conflicto con el estado actual'),
  429: json(errorSchema, 'Demasiadas peticiones'),
};
const noContent: ResponseConfig = { description: 'Operación completada sin contenido' };

function path(route: RouteConfig) {
  registry.registerPath({ ...route, path: `/api/v1${route.path}` });
}

// ── Auth ─────────────────────────────────────────────────────────────────────
path({
  method: 'post',
  path: '/auth/register',
  tags: ['Auth'],
  summary: 'Registrar un nuevo usuario',
  request: { body: jsonBody(registerBody) },
  responses: {
    201: data(authResultSchema, 'Usuario creado'),
    400: errors[400],
    409: errors[409],
    429: errors[429],
  },
});
path({
  method: 'post',
  path: '/auth/login',
  tags: ['Auth'],
  summary: 'Iniciar sesión',
  request: { body: jsonBody(loginBody) },
  responses: {
    200: data(authResultSchema, 'Sesión iniciada'),
    400: errors[400],
    401: errors[401],
    429: errors[429],
  },
});
path({
  method: 'post',
  path: '/auth/refresh',
  tags: ['Auth'],
  summary: 'Rotar el refresh token y obtener un nuevo access token',
  description:
    'Cada refresh token solo puede usarse una vez. Reutilizar un token ya rotado revoca todas las sesiones del usuario.',
  request: { body: jsonBody(refreshBody) },
  responses: {
    200: data(authResultSchema, 'Tokens renovados'),
    400: errors[400],
    401: errors[401],
  },
});
path({
  method: 'post',
  path: '/auth/logout',
  tags: ['Auth'],
  summary: 'Cerrar sesión (revoca el refresh token)',
  request: { body: jsonBody(refreshBody) },
  responses: { 204: noContent, 400: errors[400] },
});
path({
  method: 'get',
  path: '/auth/me',
  tags: ['Auth'],
  summary: 'Usuario autenticado',
  security: secured,
  responses: { 200: data(privateUserSchema, 'Perfil privado'), 401: errors[401] },
});

// ── Users ────────────────────────────────────────────────────────────────────
path({
  method: 'patch',
  path: '/users/me',
  tags: ['Users'],
  summary: 'Actualizar mi perfil',
  security: secured,
  request: { body: jsonBody(updateProfileBody) },
  responses: {
    200: data(privateUserSchema, 'Perfil actualizado'),
    400: errors[400],
    401: errors[401],
  },
});
path({
  method: 'put',
  path: '/users/me/password',
  tags: ['Users'],
  summary: 'Cambiar mi contraseña (cierra todas las sesiones)',
  security: secured,
  request: { body: jsonBody(changePasswordBody) },
  responses: { 204: noContent, 400: errors[400], 401: errors[401] },
});
path({
  method: 'get',
  path: '/users/{username}',
  tags: ['Users'],
  summary: 'Perfil público de un usuario',
  request: { params: usernameParams },
  responses: { 200: data(userProfileSchema, 'Perfil público'), 404: errors[404] },
});
path({
  method: 'patch',
  path: '/users/{username}/role',
  tags: ['Users'],
  summary: 'Cambiar el rol de un usuario (solo ADMIN)',
  security: secured,
  request: { params: usernameParams, body: jsonBody(changeRoleBody) },
  responses: {
    200: data(publicUserSchema, 'Rol actualizado'),
    400: errors[400],
    401: errors[401],
    403: errors[403],
    404: errors[404],
  },
});

// ── Articles ─────────────────────────────────────────────────────────────────
path({
  method: 'get',
  path: '/articles',
  tags: ['Articles'],
  summary: 'Listar artículos con filtros, búsqueda y paginación',
  description:
    'Sin autenticación solo devuelve artículos publicados. Con `mine=true` devuelve los del usuario autenticado en cualquier estado.',
  security: [{}, ...secured],
  request: { query: listArticlesQuery },
  responses: {
    200: page(articleSummarySchema, 'Página de artículos'),
    400: errors[400],
    401: errors[401],
  },
});
path({
  method: 'post',
  path: '/articles',
  tags: ['Articles'],
  summary: 'Crear un artículo',
  security: secured,
  request: { body: jsonBody(createArticleBody) },
  responses: { 201: data(articleSchema, 'Artículo creado'), 400: errors[400], 401: errors[401] },
});
path({
  method: 'get',
  path: '/articles/{idOrSlug}',
  tags: ['Articles'],
  summary: 'Obtener un artículo por id o slug',
  security: [{}, ...secured],
  request: { params: articleLookupParams },
  responses: { 200: data(articleSchema, 'Artículo'), 404: errors[404] },
});
path({
  method: 'put',
  path: '/articles/{id}',
  tags: ['Articles'],
  summary: 'Reemplazar un artículo completo',
  security: secured,
  request: { params: articleIdParams, body: jsonBody(replaceArticleBody) },
  responses: {
    200: data(articleSchema, 'Artículo actualizado'),
    400: errors[400],
    401: errors[401],
    403: errors[403],
    404: errors[404],
  },
});
path({
  method: 'patch',
  path: '/articles/{id}',
  tags: ['Articles'],
  summary: 'Actualizar parcialmente un artículo',
  security: secured,
  request: { params: articleIdParams, body: jsonBody(updateArticleBody) },
  responses: {
    200: data(articleSchema, 'Artículo actualizado'),
    400: errors[400],
    401: errors[401],
    403: errors[403],
    404: errors[404],
  },
});
path({
  method: 'delete',
  path: '/articles/{id}',
  tags: ['Articles'],
  summary: 'Eliminar un artículo',
  security: secured,
  request: { params: articleIdParams },
  responses: { 204: noContent, 401: errors[401], 403: errors[403], 404: errors[404] },
});

// ── Comments ─────────────────────────────────────────────────────────────────
path({
  method: 'get',
  path: '/articles/{id}/comments',
  tags: ['Comments'],
  summary: 'Listar comentarios de un artículo',
  security: [{}, ...secured],
  request: { params: articleIdParams, query: listCommentsQuery },
  responses: { 200: page(commentSchema, 'Página de comentarios'), 404: errors[404] },
});
path({
  method: 'post',
  path: '/articles/{id}/comments',
  tags: ['Comments'],
  summary: 'Comentar un artículo publicado',
  security: secured,
  request: { params: articleIdParams, body: jsonBody(commentBody) },
  responses: {
    201: data(commentSchema, 'Comentario creado'),
    400: errors[400],
    401: errors[401],
    404: errors[404],
  },
});
path({
  method: 'patch',
  path: '/comments/{id}',
  tags: ['Comments'],
  summary: 'Editar un comentario propio',
  security: secured,
  request: { params: commentIdParams, body: jsonBody(commentBody) },
  responses: {
    200: data(commentSchema, 'Comentario actualizado'),
    400: errors[400],
    401: errors[401],
    403: errors[403],
    404: errors[404],
  },
});
path({
  method: 'delete',
  path: '/comments/{id}',
  tags: ['Comments'],
  summary: 'Eliminar un comentario (autor, autor del artículo o ADMIN)',
  security: secured,
  request: { params: commentIdParams },
  responses: { 204: noContent, 401: errors[401], 403: errors[403], 404: errors[404] },
});

// ── Taxonomy ─────────────────────────────────────────────────────────────────
path({
  method: 'get',
  path: '/tags',
  tags: ['Taxonomy'],
  summary: 'Etiquetas con artículos publicados',
  responses: { 200: data(z.array(tagWithCountSchema), 'Lista de etiquetas') },
});
path({
  method: 'get',
  path: '/categories',
  tags: ['Taxonomy'],
  summary: 'Categorías y número de artículos publicados',
  responses: { 200: data(z.array(categoryWithCountSchema), 'Lista de categorías') },
});

// ── Health ───────────────────────────────────────────────────────────────────
registry.registerPath({
  method: 'get',
  path: '/health',
  tags: ['Health'],
  summary: 'Liveness probe',
  responses: {
    200: json(z.object({ status: z.literal('ok'), uptime: z.number() }), 'Proceso activo'),
  },
});
registry.registerPath({
  method: 'get',
  path: '/health/ready',
  tags: ['Health'],
  summary: 'Readiness probe (comprueba la base de datos)',
  responses: {
    200: json(z.object({ status: z.literal('ok'), database: z.literal('up') }), 'Listo'),
    503: json(
      z.object({ status: z.literal('error'), database: z.literal('down') }),
      'Base de datos no disponible',
    ),
  },
});

export const openApiDocument = new OpenApiGeneratorV31(registry.definitions).generateDocument({
  openapi: '3.1.0',
  info: {
    title: 'Blogging Platform API',
    version: '1.0.0',
    description:
      'API REST para una plataforma de blogs personales: artículos con borradores y publicación, etiquetas, categorías, comentarios, búsqueda y autenticación JWT con rotación de refresh tokens.',
    license: { name: 'MIT' },
  },
  servers: [{ url: '/' }],
  tags: [
    { name: 'Auth', description: 'Registro, login y gestión de sesiones' },
    { name: 'Users', description: 'Perfiles y administración de usuarios' },
    { name: 'Articles', description: 'CRUD y búsqueda de artículos' },
    { name: 'Comments', description: 'Comentarios en artículos' },
    { name: 'Taxonomy', description: 'Etiquetas y categorías' },
    { name: 'Health', description: 'Estado del servicio' },
  ],
});
