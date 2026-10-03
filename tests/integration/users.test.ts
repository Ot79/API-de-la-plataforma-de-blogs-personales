import { describe, expect, it } from 'vitest';

import { api, bearer, createArticle, createUser } from '../helpers';

describe('Perfiles de usuario', () => {
  it('GET /users/:username devuelve el perfil público con artículos publicados', async () => {
    const user = await createUser({ username: 'grace' });
    await createArticle(user, { title: 'Publicado' });
    await createArticle(user, { title: 'Borrador', status: 'DRAFT' });

    const res = await api().get('/api/v1/users/GRACE');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ username: 'grace', publishedArticles: 1 });
    expect(res.body.data).not.toHaveProperty('email');
  });

  it('devuelve 404 para usuarios inexistentes', async () => {
    expect((await api().get('/api/v1/users/nadie')).status).toBe(404);
  });

  it('PATCH /users/me actualiza displayName y bio', async () => {
    const user = await createUser();
    const res = await api()
      .patch('/api/v1/users/me')
      .set(bearer(user))
      .send({ displayName: 'Nuevo nombre', bio: 'Hola' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ displayName: 'Nuevo nombre', bio: 'Hola' });

    const cleared = await api().patch('/api/v1/users/me').set(bearer(user)).send({ bio: null });
    expect(cleared.body.data.bio).toBeNull();
  });

  it('PATCH /users/me rechaza un cuerpo vacío', async () => {
    const user = await createUser();
    expect((await api().patch('/api/v1/users/me').set(bearer(user)).send({})).status).toBe(400);
  });
});

describe('PUT /users/me/password', () => {
  it('cambia la contraseña y cierra las sesiones existentes', async () => {
    const user = await createUser();
    const res = await api()
      .put('/api/v1/users/me/password')
      .set(bearer(user))
      .send({ currentPassword: user.password, newPassword: 'NuevaClave9' });
    expect(res.status).toBe(204);

    expect(
      (await api().post('/api/v1/auth/refresh').send({ refreshToken: user.refreshToken })).status,
    ).toBe(401);
    expect(
      (await api().post('/api/v1/auth/login').send({ email: user.email, password: user.password }))
        .status,
    ).toBe(401);
    expect(
      (await api().post('/api/v1/auth/login').send({ email: user.email, password: 'NuevaClave9' }))
        .status,
    ).toBe(200);
  });

  it('exige la contraseña actual correcta', async () => {
    const user = await createUser();
    const res = await api()
      .put('/api/v1/users/me/password')
      .set(bearer(user))
      .send({ currentPassword: 'Incorrecta1', newPassword: 'NuevaClave9' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /users/:username/role', () => {
  it('un ADMIN puede promover a otro usuario', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const user = await createUser();

    const res = await api()
      .patch(`/api/v1/users/${user.username}/role`)
      .set(bearer(admin))
      .send({ role: 'ADMIN' });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('ADMIN');
  });

  it('un USER recibe 403', async () => {
    const user = await createUser();
    const other = await createUser();
    const res = await api()
      .patch(`/api/v1/users/${other.username}/role`)
      .set(bearer(user))
      .send({ role: 'ADMIN' });
    expect(res.status).toBe(403);
  });

  it('un ADMIN no puede cambiar su propio rol', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const res = await api()
      .patch(`/api/v1/users/${admin.username}/role`)
      .set(bearer(admin))
      .send({ role: 'USER' });
    expect(res.status).toBe(400);
  });
});
