import { randomBytes } from 'node:crypto';

import type { ArticleStatus, Prisma } from '../../generated/prisma/client';
import { AppError } from '../../lib/errors';
import { buildPageMeta, toSkipTake } from '../../lib/pagination';
import { prisma } from '../../lib/prisma';
import { uniqueViolationFields } from '../../lib/prisma-errors';
import { buildExcerpt, readingTimeMinutes } from '../../lib/reading-time';
import { slugify, uniqueSlug } from '../../lib/slug';
import { upsertCategory, upsertTags } from '../taxonomy/taxonomy.service';
import type { CreateArticleInput, ListArticlesQuery, UpdateArticleInput } from './articles.schemas';

export interface Viewer {
  id: string;
  role: 'USER' | 'ADMIN';
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const articleInclude = {
  author: { select: { id: true, username: true, displayName: true } },
  category: { select: { name: true, slug: true } },
  tags: { select: { tag: { select: { name: true, slug: true } } } },
  _count: { select: { comments: true } },
} satisfies Prisma.ArticleInclude;

type ArticleWithRelations = Prisma.ArticleGetPayload<{ include: typeof articleInclude }>;

function toSummary(article: ArticleWithRelations) {
  return {
    id: article.id,
    title: article.title,
    slug: article.slug,
    excerpt: article.excerpt,
    status: article.status,
    readingTimeMinutes: article.readingTimeMinutes,
    publishedAt: article.publishedAt?.toISOString() ?? null,
    createdAt: article.createdAt.toISOString(),
    updatedAt: article.updatedAt.toISOString(),
    author: article.author,
    category: article.category,
    tags: article.tags.map(({ tag }) => tag).sort((a, b) => a.name.localeCompare(b.name)),
    commentCount: article._count.comments,
  };
}

function toDetail(article: ArticleWithRelations) {
  return { ...toSummary(article), content: article.content };
}

/** Carga el artículo con sus relaciones fuera de la transacción de escritura. */
async function loadDetail(id: string) {
  return toDetail(
    await prisma.article.findUniqueOrThrow({ where: { id }, include: articleInclude }),
  );
}

const isAdmin = (viewer?: Viewer) => viewer?.role === 'ADMIN';

function canView(article: { status: ArticleStatus; authorId: string }, viewer?: Viewer) {
  return article.status === 'PUBLISHED' || isAdmin(viewer) || article.authorId === viewer?.id;
}

function assertCanModify(article: { authorId: string }, viewer: Viewer) {
  if (article.authorId !== viewer.id && !isAdmin(viewer)) {
    throw AppError.forbidden('Solo el autor o un administrador pueden modificar este artículo');
  }
}

/** Calcula `publishedAt` al cambiar de estado. */
function resolvePublishedAt(status: ArticleStatus, current: Date | null): Date | null {
  if (status === 'PUBLISHED') return current ?? new Date();
  if (status === 'DRAFT') return null;
  return current; // ARCHIVED conserva la fecha original de publicación.
}

/** Una fecha sin hora en `publishedTo` incluye el día completo. */
function endOfRange(value: string): Date {
  const date = new Date(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) date.setUTCDate(date.getUTCDate() + 1);
  else date.setTime(date.getTime() + 1);
  return date;
}

function buildListWhere(query: ListArticlesQuery, viewer?: Viewer): Prisma.ArticleWhereInput {
  const and: Prisma.ArticleWhereInput[] = [];

  if (query.mine) {
    if (!viewer) throw AppError.unauthorized('Debes autenticarte para usar mine=true');
    and.push({ authorId: viewer.id });
    if (query.status) and.push({ status: query.status });
  } else if (isAdmin(viewer) && query.status) {
    and.push({ status: query.status });
  } else {
    // El público solo ve artículos publicados.
    and.push({ status: 'PUBLISHED' });
  }

  if (query.author) and.push({ author: { username: query.author } });
  if (query.category) and.push({ category: { slug: query.category } });
  if (query.tags?.length) and.push({ tags: { some: { tag: { slug: { in: query.tags } } } } });

  if (query.publishedFrom || query.publishedTo) {
    and.push({
      publishedAt: {
        ...(query.publishedFrom && { gte: new Date(query.publishedFrom) }),
        ...(query.publishedTo && { lt: endOfRange(query.publishedTo) }),
      },
    });
  }

  if (query.term) {
    const contains = { contains: query.term, mode: 'insensitive' as const };
    and.push({
      OR: [
        { title: contains },
        { excerpt: contains },
        { content: contains },
        { category: { name: contains } },
        { tags: { some: { tag: { name: contains } } } },
      ],
    });
  }

  return { AND: and };
}

export async function listArticles(query: ListArticlesQuery, viewer?: Viewer) {
  const where = buildListWhere(query, viewer);
  // Orden secundario estable para que la paginación sea determinista.
  const orderBy: Prisma.ArticleOrderByWithRelationInput[] = [
    query.sort === 'publishedAt'
      ? { publishedAt: { sort: query.order, nulls: 'last' } }
      : { [query.sort]: query.order },
    { createdAt: 'desc' },
    { id: 'asc' },
  ];

  const [articles, total] = await Promise.all([
    prisma.article.findMany({ where, orderBy, include: articleInclude, ...toSkipTake(query) }),
    prisma.article.count({ where }),
  ]);

  return { data: articles.map(toSummary), meta: buildPageMeta(query, total) };
}

export async function getArticle(idOrSlug: string, viewer?: Viewer) {
  const article = await prisma.article.findFirst({
    where: UUID_REGEX.test(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug.toLowerCase() },
    include: articleInclude,
  });

  // Los borradores ajenos se ocultan como 404 para no revelar su existencia.
  if (!article || !canView(article, viewer)) throw AppError.notFound('Artículo');
  return toDetail(article);
}

const slugExists = async (slug: string) => (await prisma.article.count({ where: { slug } })) > 0;

const MAX_SLUG_ATTEMPTS = 5;

const isSlugConflict = (error: unknown) => uniqueViolationFields(error)?.includes('slug') ?? false;

export async function createArticle(input: CreateArticleInput, viewer: Viewer) {
  // Dos peticiones simultáneas con el mismo título pueden calcular el mismo
  // slug; si la restricción única salta se reintenta añadiendo un sufijo
  // aleatorio para que los competidores no vuelvan a colisionar entre sí.
  for (let attempt = 1; ; attempt += 1) {
    try {
      const slug =
        attempt === 1
          ? await uniqueSlug(input.title, slugExists)
          : `${slugify(input.title, 72) || 'articulo'}-${randomBytes(3).toString('hex')}`;
      return await insertArticle(input, viewer, slug);
    } catch (error) {
      if (attempt >= MAX_SLUG_ATTEMPTS || !isSlugConflict(error)) throw error;
    }
  }
}

async function insertArticle(input: CreateArticleInput, viewer: Viewer, slug: string) {
  const { id } = await prisma.$transaction(async (tx) => {
    const tagIds = await upsertTags(tx, input.tags);
    const categoryId = input.category ? await upsertCategory(tx, input.category) : null;

    return tx.article.create({
      data: {
        title: input.title,
        slug,
        content: input.content,
        excerpt: input.excerpt || buildExcerpt(input.content),
        status: input.status,
        publishedAt: resolvePublishedAt(input.status, null),
        readingTimeMinutes: readingTimeMinutes(input.content),
        authorId: viewer.id,
        categoryId,
        tags: { create: tagIds.map((tagId) => ({ tagId })) },
      },
      select: { id: true },
    });
  });

  return loadDetail(id);
}

/**
 * Actualiza un artículo. Con `replace=true` (PUT) los campos opcionales
 * omitidos se restablecen; con PATCH solo cambian los campos enviados.
 */
export async function updateArticle(
  id: string,
  input: UpdateArticleInput,
  viewer: Viewer,
  { replace = false } = {},
) {
  const existing = await prisma.article.findUnique({ where: { id } });
  if (!existing || !canView(existing, viewer)) throw AppError.notFound('Artículo');
  assertCanModify(existing, viewer);

  const status = input.status ?? (replace ? 'DRAFT' : existing.status);
  const content = input.content ?? existing.content;
  const contentChanged = input.content !== undefined && input.content !== existing.content;

  // El slug solo se regenera mientras el artículo nunca se ha publicado,
  // para no romper enlaces ya compartidos.
  const titleChanged = input.title !== undefined && input.title !== existing.title;
  const slug =
    titleChanged && !existing.publishedAt
      ? await uniqueSlug(input.title!, async (candidate) =>
          candidate === existing.slug ? false : slugExists(candidate),
        )
      : existing.slug;

  let excerpt = existing.excerpt;
  if (input.excerpt !== undefined) excerpt = input.excerpt || buildExcerpt(content);
  else if (replace || contentChanged) excerpt = buildExcerpt(content);

  await prisma.$transaction(async (tx) => {
    let categoryId = existing.categoryId;
    if (input.category !== undefined) {
      categoryId = input.category ? await upsertCategory(tx, input.category) : null;
    } else if (replace) {
      categoryId = null;
    }

    const tags = input.tags ?? (replace ? [] : undefined);
    if (tags !== undefined) {
      const tagIds = await upsertTags(tx, tags);
      await tx.articleTag.deleteMany({ where: { articleId: id } });
      if (tagIds.length) {
        await tx.articleTag.createMany({ data: tagIds.map((tagId) => ({ articleId: id, tagId })) });
      }
    }

    await tx.article.update({
      where: { id },
      data: {
        title: input.title ?? existing.title,
        slug,
        content,
        excerpt,
        status,
        publishedAt: resolvePublishedAt(status, existing.publishedAt),
        readingTimeMinutes: readingTimeMinutes(content),
        categoryId,
      },
    });
  });

  return loadDetail(id);
}

export async function deleteArticle(id: string, viewer: Viewer) {
  const existing = await prisma.article.findUnique({
    where: { id },
    select: { authorId: true, status: true },
  });
  if (!existing || !canView(existing, viewer)) throw AppError.notFound('Artículo');
  assertCanModify(existing, viewer);

  await prisma.article.delete({ where: { id } });
}

/** Devuelve el artículo si el usuario puede verlo (usado por comentarios). */
export async function findVisibleArticle(id: string, viewer?: Viewer) {
  const article = await prisma.article.findUnique({
    where: { id },
    select: { id: true, authorId: true, status: true },
  });
  if (!article || !canView(article, viewer)) throw AppError.notFound('Artículo');
  return article;
}
