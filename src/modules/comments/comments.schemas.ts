import { z } from 'zod';

import { paginationQuery } from '../../lib/pagination';
import { authorSummarySchema } from '../users/users.schemas';

const commentContent = z
  .string()
  .trim()
  .min(1, 'El comentario no puede estar vacío')
  .max(2000, 'Máximo 2000 caracteres')
  .meta({ example: '¡Muy buen artículo, gracias por compartir!' });

export const commentBody = z.object({ content: commentContent }).meta({ id: 'CommentInput' });

export const commentIdParams = z.object({ id: z.uuid('Identificador de comentario inválido') });

export const listCommentsQuery = paginationQuery.extend({
  order: z.enum(['asc', 'desc']).default('asc'),
});

export const commentSchema = z
  .object({
    id: z.uuid(),
    content: z.string(),
    articleId: z.uuid(),
    author: authorSummarySchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Comment' });

export type ListCommentsQuery = z.infer<typeof listCommentsQuery>;
