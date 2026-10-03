import { describe, expect, it } from 'vitest';

import { prisma } from '../../src/lib/prisma';
import { api, bearer, createArticle, createUser } from '../helpers';

const longContent = `# Introducción\n\n${'palabra '.repeat(450)}`;

describe('POST /api/v1/articles', () => {
  it('crea un artículo publicado con slug, extracto, tiempo de lectura, categoría y etiquetas', async () => {
    const user = await createUser();
    const res = await api()
      .post('/api/v1/articles')
      .set(bearer(user))
      .send({
        title: 'Mi Primer Artículo: ¡Hola Mundo!',
        content: longContent,
        category: 'Tecnología',
        tags: ['Node.js', 'API', 'node js'],
        status: 'PUBLISHED',
      });

    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/api/v1/articles/${res.body.data.id}`);
    expect(res.body.data).toMatchObject({
      title: 'Mi Primer Artículo: ¡Hola Mundo!',
      slug: 'mi-primer-articulo-hola-mundo',
      status: 'PUBLISHED',
      readingTimeMinutes: 3,
      category: { name: 'Tecnología', slug: 'tecnologia' },
      tags: [
        { name: 'API', slug: 'api' },
        { name: 'Node.js', slug: 'node-js' },
      ],
      author: { id: user.id, username: user.username },
      commentCount: 0,
    });
    expect(res.body.data.excerpt.startsWith('Introducción palabra')).toBe(true);
    expect(res.body.data.publishedAt).not.toBeNull();
  });

  it('crea borradores por defecto sin fecha de publicación', async () => {
    const user = await createUser();
    const res = await api()
      .post('/api/v1/articles')
      .set(bearer(user))
      .send({ title: 'Borrador', content: 'Texto' });

    expect(res.body.data).toMatchObject({ status: 'DRAFT', publishedAt: null, tags: [] });
  });

  it('genera slugs únicos para títulos repetidos', async () => {
    const user = await createUser();
    const a = await createArticle(user, { title: 'Mismo título' });
    const b = await createArticle(user, { title: 'Mismo título' });
    expect(a.slug).toBe('mismo-titulo');
    expect(b.slug).toBe('mismo-titulo-2');
  });

  it('crea artículos simultáneos con el mismo título sin conflictos', async () => {
    const user = await createUser();
    const results = await Promise.all(
      Array.from({ length: 4 }, () => createArticle(user, { title: 'Concurrente' })),
    );
    expect(new Set(results.map((a) => a.slug)).size).toBe(4);
  });

  it('valida el cuerpo y exige autenticación', async () => {
    const user = await createUser();
    const invalid = await api()
      .post('/api/v1/articles')
      .set(bearer(user))
      .send({ title: 'ab', content: '', tags: Array(11).fill('x'), status: 'OTRO' });
    expect(invalid.status).toBe(400);
    const paths = invalid.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['title', 'content', 'tags', 'status']));

    const anonymous = await api().post('/api/v1/articles').send({ title: 'Hola', content: 'x' });
    expect(anonymous.status).toBe(401);
  });
});

describe('GET /api/v1/articles/:idOrSlug', () => {
  it('obtiene un artículo publicado por id o por slug, con contenido', async () => {
    const user = await createUser();
    const article = await createArticle(user, { title: 'Buscar por slug' });

    const byId = await api().get(`/api/v1/articles/${article.id}`);
    const bySlug = await api().get('/api/v1/articles/buscar-por-slug');

    expect(byId.status).toBe(200);
    expect(bySlug.body.data.id).toBe(article.id);
    expect(bySlug.body.data.content).toBeTruthy();
  });

  it('oculta los borradores a otros usuarios (404) pero no a su autor ni a un admin', async () => {
    const author = await createUser();
    const other = await createUser();
    const admin = await createUser({ role: 'ADMIN' });
    const draft = await createArticle(author, { status: 'DRAFT' });

    expect((await api().get(`/api/v1/articles/${draft.id}`)).status).toBe(404);
    expect((await api().get(`/api/v1/articles/${draft.id}`).set(bearer(other))).status).toBe(404);
    expect((await api().get(`/api/v1/articles/${draft.id}`).set(bearer(author))).status).toBe(200);
    expect((await api().get(`/api/v1/articles/${draft.id}`).set(bearer(admin))).status).toBe(200);
  });

  it('devuelve 404 si no existe', async () => {
    const res = await api().get('/api/v1/articles/00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Artículo no encontrado');
  });
});

describe('GET /api/v1/articles (listado y filtros)', () => {
  async function seed() {
    const ada = await createUser({ username: 'ada' });
    const linus = await createUser({ username: 'linus' });

    const node = await createArticle(ada, {
      title: 'Introducción a Node.js',
      content: 'Event loop y streams',
      category: 'Tecnología',
      tags: ['Node.js', 'JavaScript'],
    });
    const pg = await createArticle(linus, {
      title: 'Índices en PostgreSQL',
      content: 'B-tree, GIN y planes de ejecución',
      category: 'Bases de datos',
      tags: ['PostgreSQL'],
    });
    const cooking = await createArticle(ada, {
      title: 'Receta de paella',
      content: 'Arroz, azafrán y paciencia',
      category: 'Cocina',
      tags: ['Recetas'],
    });
    const draft = await createArticle(ada, { title: 'Borrador secreto', status: 'DRAFT' });
    const archived = await createArticle(ada, { title: 'Archivado', status: 'ARCHIVED' });

    // Fechas de publicación controladas para probar los filtros por fecha.
    await prisma.article.update({
      where: { id: node.id },
      data: { publishedAt: new Date('2025-01-10T10:00:00Z') },
    });
    await prisma.article.update({
      where: { id: pg.id },
      data: { publishedAt: new Date('2025-03-15T10:00:00Z') },
    });
    await prisma.article.update({
      where: { id: cooking.id },
      data: { publishedAt: new Date('2025-06-01T10:00:00Z') },
    });

    return { ada, linus, node, pg, cooking, draft, archived };
  }

  const titles = (res: { body: { data: { title: string }[] } }) =>
    res.body.data.map((a) => a.title);

  it('lista solo publicados, ordenados por fecha de publicación descendente, sin contenido', async () => {
    await seed();
    const res = await api().get('/api/v1/articles');

    expect(res.status).toBe(200);
    expect(titles(res)).toEqual([
      'Receta de paella',
      'Índices en PostgreSQL',
      'Introducción a Node.js',
    ]);
    expect(res.body.data[0]).not.toHaveProperty('content');
    expect(res.body.meta).toEqual({ page: 1, limit: 10, total: 3, totalPages: 1 });
  });

  it('pagina resultados', async () => {
    await seed();
    const res = await api().get('/api/v1/articles?page=2&limit=2');
    expect(titles(res)).toEqual(['Introducción a Node.js']);
    expect(res.body.meta).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
  });

  it('busca por término en título, contenido, categoría y etiquetas (sin distinguir mayúsculas)', async () => {
    await seed();
    expect(titles(await api().get('/api/v1/articles?term=postgresql'))).toEqual([
      'Índices en PostgreSQL',
    ]);
    expect(titles(await api().get('/api/v1/articles?term=AZAFRÁN'))).toEqual(['Receta de paella']);
    expect(titles(await api().get('/api/v1/articles?term=tecnolog'))).toEqual([
      'Introducción a Node.js',
    ]);
    expect(titles(await api().get('/api/v1/articles?term=javascript'))).toEqual([
      'Introducción a Node.js',
    ]);
    expect(titles(await api().get('/api/v1/articles?term=secreto'))).toEqual([]);
  });

  it('filtra por etiquetas, categoría y autor', async () => {
    await seed();
    expect(titles(await api().get('/api/v1/articles?tags=postgresql,recetas'))).toEqual([
      'Receta de paella',
      'Índices en PostgreSQL',
    ]);
    expect(titles(await api().get('/api/v1/articles?category=bases-de-datos'))).toEqual([
      'Índices en PostgreSQL',
    ]);
    expect(titles(await api().get('/api/v1/articles?author=linus'))).toEqual([
      'Índices en PostgreSQL',
    ]);
  });

  it('filtra por rango de fechas de publicación (publishedTo incluye el día completo)', async () => {
    await seed();
    const res = await api().get('/api/v1/articles?publishedFrom=2025-01-10&publishedTo=2025-03-15');
    expect(titles(res)).toEqual(['Índices en PostgreSQL', 'Introducción a Node.js']);
  });

  it('rechaza rangos de fechas invertidos o inválidos', async () => {
    expect(
      (await api().get('/api/v1/articles?publishedFrom=2025-05-01&publishedTo=2025-01-01')).status,
    ).toBe(400);
    expect((await api().get('/api/v1/articles?publishedFrom=ayer')).status).toBe(400);
  });

  it('ordena por título ascendente', async () => {
    await seed();
    const res = await api().get('/api/v1/articles?sort=title&order=asc');
    expect(titles(res)).toEqual([
      'Introducción a Node.js',
      'Receta de paella',
      'Índices en PostgreSQL',
    ]);
  });

  it('mine=true lista los artículos propios en cualquier estado y admite filtro de estado', async () => {
    const { ada } = await seed();
    const mine = await api().get('/api/v1/articles?mine=true').set(bearer(ada));
    expect(mine.body.meta.total).toBe(4);

    const drafts = await api().get('/api/v1/articles?mine=true&status=DRAFT').set(bearer(ada));
    expect(titles(drafts)).toEqual(['Borrador secreto']);

    expect((await api().get('/api/v1/articles?mine=true')).status).toBe(401);
  });

  it('el filtro de estado se ignora para el público pero aplica para admins', async () => {
    await seed();
    const anon = await api().get('/api/v1/articles?status=DRAFT');
    expect(anon.body.data.every((a: { status: string }) => a.status === 'PUBLISHED')).toBe(true);

    const admin = await createUser({ role: 'ADMIN' });
    const res = await api().get('/api/v1/articles?status=ARCHIVED').set(bearer(admin));
    expect(titles(res)).toEqual(['Archivado']);
  });

  it('valida los parámetros de consulta', async () => {
    expect((await api().get('/api/v1/articles?limit=1000')).status).toBe(400);
    expect((await api().get('/api/v1/articles?page=0')).status).toBe(400);
    expect((await api().get('/api/v1/articles?sort=hack')).status).toBe(400);
  });
});

describe('PUT/PATCH /api/v1/articles/:id', () => {
  it('PATCH actualiza solo los campos enviados y recalcula metadatos', async () => {
    const user = await createUser();
    const article = await createArticle(user, {
      title: 'Original',
      category: 'Tech',
      tags: ['uno'],
      excerpt: 'Extracto manual',
    });

    const res = await api()
      .patch(`/api/v1/articles/${article.id}`)
      .set(bearer(user))
      .send({ content: longContent });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      title: 'Original',
      readingTimeMinutes: 3,
      category: { slug: 'tech' },
      tags: [{ slug: 'uno' }],
    });
    // Al cambiar el contenido se regenera el extracto.
    expect(res.body.data.excerpt).not.toBe('Extracto manual');
  });

  it('PUT reemplaza el recurso completo (campos omitidos vuelven a su valor por defecto)', async () => {
    const user = await createUser();
    const article = await createArticle(user, { category: 'Tech', tags: ['uno', 'dos'] });

    const res = await api()
      .put(`/api/v1/articles/${article.id}`)
      .set(bearer(user))
      .send({ title: 'Nuevo título', content: 'Nuevo contenido' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      title: 'Nuevo título',
      content: 'Nuevo contenido',
      status: 'DRAFT',
      category: null,
      tags: [],
      publishedAt: null,
    });
  });

  it('PUT exige los campos obligatorios', async () => {
    const user = await createUser();
    const article = await createArticle(user);
    const res = await api()
      .put(`/api/v1/articles/${article.id}`)
      .set(bearer(user))
      .send({ title: 'Solo título' });
    expect(res.status).toBe(400);
  });

  it('regenera el slug de un borrador al cambiar el título, pero no el de uno ya publicado', async () => {
    const user = await createUser();
    const draft = await createArticle(user, { title: 'Borrador inicial', status: 'DRAFT' });
    const renamedDraft = await api()
      .patch(`/api/v1/articles/${draft.id}`)
      .set(bearer(user))
      .send({ title: 'Título definitivo' });
    expect(renamedDraft.body.data.slug).toBe('titulo-definitivo');

    const published = await createArticle(user, { title: 'Publicado antes' });
    const renamedPublished = await api()
      .patch(`/api/v1/articles/${published.id}`)
      .set(bearer(user))
      .send({ title: 'Otro título' });
    expect(renamedPublished.body.data.slug).toBe('publicado-antes');
  });

  it('gestiona publishedAt en las transiciones de estado', async () => {
    const user = await createUser();
    const article = await createArticle(user, { status: 'DRAFT' });
    const patch = (status: string) =>
      api().patch(`/api/v1/articles/${article.id}`).set(bearer(user)).send({ status });

    const published = await patch('PUBLISHED');
    const publishedAt = published.body.data.publishedAt;
    expect(publishedAt).not.toBeNull();

    const archived = await patch('ARCHIVED');
    expect(archived.body.data.publishedAt).toBe(publishedAt);

    const republished = await patch('PUBLISHED');
    expect(republished.body.data.publishedAt).toBe(publishedAt);

    const draft = await patch('DRAFT');
    expect(draft.body.data.publishedAt).toBeNull();
  });

  it('PATCH rechaza cuerpo vacío e ids inválidos', async () => {
    const user = await createUser();
    const article = await createArticle(user);
    expect(
      (await api().patch(`/api/v1/articles/${article.id}`).set(bearer(user)).send({})).status,
    ).toBe(400);
    expect(
      (await api().patch('/api/v1/articles/no-uuid').set(bearer(user)).send({ title: 'Hola' }))
        .status,
    ).toBe(400);
  });

  it('solo el autor o un admin pueden modificar', async () => {
    const author = await createUser();
    const other = await createUser();
    const admin = await createUser({ role: 'ADMIN' });
    const article = await createArticle(author);

    const forbidden = await api()
      .patch(`/api/v1/articles/${article.id}`)
      .set(bearer(other))
      .send({ title: 'Hackeado' });
    expect(forbidden.status).toBe(403);

    const asAdmin = await api()
      .patch(`/api/v1/articles/${article.id}`)
      .set(bearer(admin))
      .send({ title: 'Moderado' });
    expect(asAdmin.status).toBe(200);
  });

  it('otro usuario recibe 404 al intentar modificar un borrador ajeno', async () => {
    const author = await createUser();
    const other = await createUser();
    const draft = await createArticle(author, { status: 'DRAFT' });
    const res = await api()
      .patch(`/api/v1/articles/${draft.id}`)
      .set(bearer(other))
      .send({ title: 'Hola' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/v1/articles/:id', () => {
  it('elimina el artículo y sus comentarios', async () => {
    const user = await createUser();
    const article = await createArticle(user);
    await api()
      .post(`/api/v1/articles/${article.id}/comments`)
      .set(bearer(user))
      .send({ content: 'Hola' });

    const res = await api().delete(`/api/v1/articles/${article.id}`).set(bearer(user));
    expect(res.status).toBe(204);
    expect((await api().get(`/api/v1/articles/${article.id}`)).status).toBe(404);
    expect(await prisma.comment.count()).toBe(0);
  });

  it('devuelve 403 a otros usuarios y 404 si no existe', async () => {
    const author = await createUser();
    const other = await createUser();
    const article = await createArticle(author);

    expect((await api().delete(`/api/v1/articles/${article.id}`).set(bearer(other))).status).toBe(
      403,
    );
    expect(
      (
        await api()
          .delete('/api/v1/articles/00000000-0000-4000-8000-000000000000')
          .set(bearer(author))
      ).status,
    ).toBe(404);
  });
});
