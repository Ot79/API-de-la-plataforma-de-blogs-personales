import { z } from 'zod';

import { paginationQuery } from '../../lib/pagination';
import {
  categoryNameSchema,
  categorySchema,
  tagNameSchema,
  tagSchema,
} from '../taxonomy/taxonomy.schemas';
import { authorSummarySchema } from '../users/users.schemas';

export const articleStatusSchema = z
  .enum(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
  .meta({ id: 'ArticleStatus' });

const titleSchema = z
  .string()
  .trim()
  .min(3, 'Mínimo 3 caracteres')
  .max(150, 'Máximo 150 caracteres')
  .meta({ example: 'Diseñando una API REST con Express y Prisma' });

const contentSchema = z
  .string()
  .trim()
  .min(1, 'El contenido no puede estar vacío')
  .max(100_000, 'Máximo 100.000 caracteres')
  .meta({
    description: 'Contenido en Markdown',
    example: '## Introducción\n\nEn este artículo...',
  });

const excerptSchema = z.string().trim().max(300, 'Máximo 300 caracteres');

const tagsSchema = z
  .array(tagNameSchema)
  .max(10, 'Máximo 10 etiquetas')
  .meta({ example: ['Node.js', 'API', 'PostgreSQL'] });

/** Campos del artículo. PUT exige los obligatorios; PATCH acepta cualquier subconjunto. */
const articleFields = {
  title: titleSchema,
  content: contentSchema,
  excerpt: excerptSchema.nullable().optional().meta({
    description: 'Si se omite se genera automáticamente a partir del contenido',
  }),
  category: categoryNameSchema.nullable().optional(),
  tags: tagsSchema.optional(),
  status: articleStatusSchema.optional(),
};

export const createArticleBody = z
  .object({
    ...articleFields,
    tags: tagsSchema.default([]),
    status: articleStatusSchema.default('DRAFT'),
  })
  .meta({ id: 'CreateArticleInput' });

export const replaceArticleBody = createArticleBody.meta({ id: 'ReplaceArticleInput' });

export const updateArticleBody = z
  .object(articleFields)
  .partial()
  .refine((data) => Object.keys(data).length > 0, 'Debes enviar al menos un campo')
  .meta({ id: 'UpdateArticleInput' });

export const articleIdParams = z.object({
  id: z.uuid('Identificador de artículo inválido'),
});

export const articleLookupParams = z.object({
  idOrSlug: z.string().min(1).max(120).meta({ description: 'UUID o slug del artículo' }),
});

const dateParam = z
  .union([z.iso.date(), z.iso.datetime({ offset: true })])
  .meta({ description: 'Fecha ISO 8601 (YYYY-MM-DD o fecha-hora completa)' });

const csvParam = z
  .string()
  .trim()
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );

const booleanParam = z.enum(['true', 'false']).transform((value) => value === 'true');

export const listArticlesQuery = paginationQuery
  .extend({
    term: z.string().trim().min(1).max(100).optional().meta({
      description: 'Búsqueda de texto en título, extracto, contenido, categoría y etiquetas',
    }),
    tags: csvParam.optional().meta({
      description: 'Slugs de etiquetas separados por coma (coincide con cualquiera)',
      example: 'node-js,api',
    }),
    category: z.string().trim().toLowerCase().optional().meta({ description: 'Slug de categoría' }),
    author: z.string().trim().toLowerCase().optional().meta({ description: 'Username del autor' }),
    status: articleStatusSchema.optional().meta({
      description: 'Solo aplica a tus propios artículos (`mine=true`) o si eres ADMIN',
    }),
    mine: booleanParam.optional().meta({
      description: 'Lista únicamente los artículos del usuario autenticado (cualquier estado)',
    }),
    publishedFrom: dateParam.optional(),
    publishedTo: dateParam.optional(),
    sort: z.enum(['publishedAt', 'createdAt', 'updatedAt', 'title']).default('publishedAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .refine(
    (q) =>
      !q.publishedFrom || !q.publishedTo || new Date(q.publishedFrom) <= new Date(q.publishedTo),
    { message: 'publishedFrom debe ser anterior o igual a publishedTo', path: ['publishedFrom'] },
  );

const articleBaseSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  slug: z.string(),
  excerpt: z.string().nullable(),
  status: articleStatusSchema,
  readingTimeMinutes: z.number().int(),
  publishedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  author: authorSummarySchema,
  category: categorySchema.nullable(),
  tags: z.array(tagSchema),
  commentCount: z.number().int(),
});

export const articleSummarySchema = articleBaseSchema.meta({ id: 'ArticleSummary' });

export const articleSchema = articleBaseSchema
  .extend({ content: z.string() })
  .meta({ id: 'Article' });

export type CreateArticleInput = z.infer<typeof createArticleBody>;
export type UpdateArticleInput = z.infer<typeof updateArticleBody>;
export type ListArticlesQuery = z.infer<typeof listArticlesQuery>;
