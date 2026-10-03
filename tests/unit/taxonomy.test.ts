import { describe, expect, it } from 'vitest';

import { buildPageMeta, toSkipTake } from '../../src/lib/pagination';
import { normalizeTagNames } from '../../src/modules/taxonomy/taxonomy.service';

describe('normalizeTagNames', () => {
  it('deduplica por slug conservando la primera forma', () => {
    expect(normalizeTagNames(['Node.js', 'node js', '  API ', 'api'])).toEqual([
      { slug: 'node-js', name: 'Node.js' },
      { slug: 'api', name: 'API' },
    ]);
  });

  it('descarta etiquetas sin caracteres válidos', () => {
    expect(normalizeTagNames(['???', 'ok'])).toEqual([{ slug: 'ok', name: 'ok' }]);
  });
});

describe('paginación', () => {
  it('convierte page/limit en skip/take', () => {
    expect(toSkipTake({ page: 3, limit: 10 })).toEqual({ skip: 20, take: 10 });
  });

  it('calcula el total de páginas', () => {
    expect(buildPageMeta({ page: 1, limit: 10 }, 25)).toEqual({
      page: 1,
      limit: 10,
      total: 25,
      totalPages: 3,
    });
    expect(buildPageMeta({ page: 1, limit: 10 }, 0).totalPages).toBe(0);
  });
});
