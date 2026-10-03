import { z } from 'zod';

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1).meta({ description: 'Página (1-indexada)' }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(10)
    .meta({ description: 'Elementos por página (máx. 100)' }),
});

export type Pagination = z.infer<typeof paginationQuery>;

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function toSkipTake({ page, limit }: Pagination) {
  return { skip: (page - 1) * limit, take: limit };
}

export function buildPageMeta({ page, limit }: Pagination, total: number): PageMeta {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}
