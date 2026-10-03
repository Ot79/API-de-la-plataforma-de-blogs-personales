import { describe, expect, it } from 'vitest';

import { api, bearer, createArticle, createUser } from '../helpers';

const commentsUrl = (articleId: string) => `/api/v1/articles/${articleId}/comments`;

describe('Comentarios', () => {
  it('crea y lista comentarios paginados en orden cronológico', async () => {
    const author = await createUser();
    const reader = await createUser();
    const article = await createArticle(author);

    for (const content of ['Primero', 'Segundo', 'Tercero']) {
      const res = await api().post(commentsUrl(article.id)).set(bearer(reader)).send({ content });
      expect(res.status).toBe(201);
      expect(res.body.data.author.username).toBe(reader.username);
    }

    const page1 = await api().get(`${commentsUrl(article.id)}?limit=2`);
    expect(page1.body.data.map((c: { content: string }) => c.content)).toEqual([
      'Primero',
      'Segundo',
    ]);
    expect(page1.body.meta).toMatchObject({ total: 3, totalPages: 2 });

    const desc = await api().get(`${commentsUrl(article.id)}?order=desc&limit=1`);
    expect(desc.body.data[0].content).toBe('Tercero');

    const detail = await api().get(`/api/v1/articles/${article.id}`);
    expect(detail.body.data.commentCount).toBe(3);
  });

  it('no permite comentar sin autenticación, en borradores ni con contenido vacío', async () => {
    const author = await createUser();
    const published = await createArticle(author);
    const draft = await createArticle(author, { status: 'DRAFT' });

    expect((await api().post(commentsUrl(published.id)).send({ content: 'Hola' })).status).toBe(
      401,
    );
    expect(
      (await api().post(commentsUrl(published.id)).set(bearer(author)).send({ content: '   ' }))
        .status,
    ).toBe(400);
    // El autor ve su borrador, pero no se puede comentar hasta publicarlo.
    expect(
      (await api().post(commentsUrl(draft.id)).set(bearer(author)).send({ content: 'Hola' }))
        .status,
    ).toBe(400);
    // Otros usuarios ni siquiera ven el borrador.
    const other = await createUser();
    expect(
      (await api().post(commentsUrl(draft.id)).set(bearer(other)).send({ content: 'Hola' })).status,
    ).toBe(404);
    expect((await api().get(commentsUrl(draft.id))).status).toBe(404);
  });

  it('solo el autor del comentario puede editarlo', async () => {
    const author = await createUser();
    const commenter = await createUser();
    const article = await createArticle(author);
    const comment = (
      await api().post(commentsUrl(article.id)).set(bearer(commenter)).send({ content: 'Original' })
    ).body.data;

    const forbidden = await api()
      .patch(`/api/v1/comments/${comment.id}`)
      .set(bearer(author))
      .send({ content: 'Editado por otro' });
    expect(forbidden.status).toBe(403);

    const ok = await api()
      .patch(`/api/v1/comments/${comment.id}`)
      .set(bearer(commenter))
      .send({ content: 'Editado' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.content).toBe('Editado');
  });

  it('pueden borrar el autor del comentario, el autor del artículo y un admin', async () => {
    const author = await createUser();
    const commenter = await createUser();
    const stranger = await createUser();
    const admin = await createUser({ role: 'ADMIN' });
    const article = await createArticle(author);

    const create = async () =>
      (await api().post(commentsUrl(article.id)).set(bearer(commenter)).send({ content: 'x' })).body
        .data.id as string;

    const c1 = await create();
    expect((await api().delete(`/api/v1/comments/${c1}`).set(bearer(stranger))).status).toBe(403);
    expect((await api().delete(`/api/v1/comments/${c1}`).set(bearer(commenter))).status).toBe(204);

    const c2 = await create();
    expect((await api().delete(`/api/v1/comments/${c2}`).set(bearer(author))).status).toBe(204);

    const c3 = await create();
    expect((await api().delete(`/api/v1/comments/${c3}`).set(bearer(admin))).status).toBe(204);

    expect((await api().delete(`/api/v1/comments/${c3}`).set(bearer(admin))).status).toBe(404);
  });
});
