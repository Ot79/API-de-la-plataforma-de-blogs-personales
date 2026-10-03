import type { Prisma } from '../../generated/prisma/client';
import { AppError } from '../../lib/errors';
import { buildPageMeta, toSkipTake } from '../../lib/pagination';
import { prisma } from '../../lib/prisma';
import { findVisibleArticle, type Viewer } from '../articles/articles.service';
import type { ListCommentsQuery } from './comments.schemas';

const commentInclude = {
  author: { select: { id: true, username: true, displayName: true } },
} satisfies Prisma.CommentInclude;

type CommentWithAuthor = Prisma.CommentGetPayload<{ include: typeof commentInclude }>;

function toComment(comment: CommentWithAuthor) {
  return {
    id: comment.id,
    content: comment.content,
    articleId: comment.articleId,
    author: comment.author,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
  };
}

export async function listComments(articleId: string, query: ListCommentsQuery, viewer?: Viewer) {
  await findVisibleArticle(articleId, viewer);

  const where = { articleId };
  const [comments, total] = await Promise.all([
    prisma.comment.findMany({
      where,
      include: commentInclude,
      orderBy: [{ createdAt: query.order }, { id: 'asc' }],
      ...toSkipTake(query),
    }),
    prisma.comment.count({ where }),
  ]);

  return { data: comments.map(toComment), meta: buildPageMeta(query, total) };
}

export async function createComment(articleId: string, content: string, viewer: Viewer) {
  const article = await findVisibleArticle(articleId, viewer);
  if (article.status !== 'PUBLISHED') {
    throw AppError.badRequest('Solo se puede comentar en artículos publicados');
  }

  const comment = await prisma.comment.create({
    data: { content, articleId, authorId: viewer.id },
    include: commentInclude,
  });
  return toComment(comment);
}

async function findCommentOrThrow(id: string) {
  const comment = await prisma.comment.findUnique({
    where: { id },
    include: { article: { select: { authorId: true } } },
  });
  if (!comment) throw AppError.notFound('Comentario');
  return comment;
}

/** Solo el autor del comentario puede editarlo. */
export async function updateComment(id: string, content: string, viewer: Viewer) {
  const comment = await findCommentOrThrow(id);
  if (comment.authorId !== viewer.id) {
    throw AppError.forbidden('Solo el autor puede editar este comentario');
  }

  const updated = await prisma.comment.update({
    where: { id },
    data: { content },
    include: commentInclude,
  });
  return toComment(updated);
}

/** Pueden borrarlo su autor, el autor del artículo (moderación) o un admin. */
export async function deleteComment(id: string, viewer: Viewer) {
  const comment = await findCommentOrThrow(id);
  const allowed =
    comment.authorId === viewer.id ||
    comment.article.authorId === viewer.id ||
    viewer.role === 'ADMIN';
  if (!allowed) throw AppError.forbidden('No puedes eliminar este comentario');

  await prisma.comment.delete({ where: { id } });
}
