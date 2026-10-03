import { describe, expect, it } from 'vitest';

import { api, createArticle, createUser } from '../helpers';

describe('Etiquetas y categorías', () => {
  it('GET /tags devuelve etiquetas con artículos publicados ordenadas por popularidad', async () => {
    const user = await createUser();
    await createArticle(user, { tags: ['Node.js', 'API'] });
    await createArticle(user, { tags: ['node.js'] });
    await createArticle(user, { tags: ['Oculta'], status: 'DRAFT' });

    const res = await api().get('/api/v1/tags');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      { name: 'Node.js', slug: 'node-js', articleCount: 2 },
      { name: 'API', slug: 'api', articleCount: 1 },
    ]);
  });

  it('GET /categories devuelve categorías con el número de artículos publicados', async () => {
    const user = await createUser();
    await createArticle(user, { category: 'Tecnología' });
    await createArticle(user, { category: 'tecnologia' });
    await createArticle(user, { category: 'Viajes', status: 'DRAFT' });

    const res = await api().get('/api/v1/categories');
    expect(res.body.data).toEqual([
      { name: 'Tecnología', slug: 'tecnologia', articleCount: 2 },
      { name: 'Viajes', slug: 'viajes', articleCount: 0 },
    ]);
  });
});
