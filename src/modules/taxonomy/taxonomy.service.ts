import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { slugify } from '../../lib/slug';

type Tx = Prisma.TransactionClient;

/** Normaliza nombres de etiquetas y elimina duplicados por slug. */
export function normalizeTagNames(names: string[]) {
  const bySlug = new Map<string, string>();
  for (const raw of names) {
    const name = raw.trim().replace(/\s+/g, ' ');
    const slug = slugify(name, 40);
    if (slug && !bySlug.has(slug)) bySlug.set(slug, name);
  }
  return [...bySlug].map(([slug, name]) => ({ slug, name }));
}

/**
 * Busca o crea las etiquetas indicadas y devuelve sus ids. Las consultas se
 * hacen en serie porque una transacción interactiva usa una sola conexión.
 */
export async function upsertTags(tx: Tx, names: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const { slug, name } of normalizeTagNames(names)) {
    const tag = await tx.tag.upsert({
      where: { slug },
      update: {},
      create: { slug, name },
      select: { id: true },
    });
    ids.push(tag.id);
  }
  return ids;
}

/** Busca o crea una categoría por nombre. */
export async function upsertCategory(tx: Tx, name: string): Promise<string | null> {
  const clean = name.trim().replace(/\s+/g, ' ');
  const slug = slugify(clean, 60);
  if (!slug) return null;
  const category = await tx.category.upsert({
    where: { slug },
    update: {},
    create: { slug, name: clean },
    select: { id: true },
  });
  return category.id;
}

/** Etiquetas con el número de artículos publicados, ordenadas por popularidad. */
export async function listTags() {
  const tags = await prisma.tag.findMany({
    select: {
      name: true,
      slug: true,
      _count: { select: { articles: { where: { article: { status: 'PUBLISHED' } } } } },
    },
  });

  return tags
    .map(({ name, slug, _count }) => ({ name, slug, articleCount: _count.articles }))
    .filter((tag) => tag.articleCount > 0)
    .sort((a, b) => b.articleCount - a.articleCount || a.name.localeCompare(b.name));
}

/** Categorías con el número de artículos publicados. */
export async function listCategories() {
  const categories = await prisma.category.findMany({
    select: {
      name: true,
      slug: true,
      _count: { select: { articles: { where: { status: 'PUBLISHED' } } } },
    },
    orderBy: { name: 'asc' },
  });

  return categories.map(({ name, slug, _count }) => ({
    name,
    slug,
    articleCount: _count.articles,
  }));
}
