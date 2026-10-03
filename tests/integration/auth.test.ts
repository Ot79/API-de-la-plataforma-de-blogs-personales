import { describe, expect, it } from 'vitest';

import { prisma } from '../../src/lib/prisma';
import { api, bearer, createUser } from '../helpers';

const validUser = {
  email: 'Ada@Example.com',
  username: 'Ada_Lovelace',
  password: 'Analytical1',
  displayName: 'Ada Lovelace',
};

describe('POST /api/v1/auth/register', () => {
  it('crea el usuario, normaliza email/username y devuelve tokens', async () => {
    const res = await api().post('/api/v1/auth/register').send(validUser);

    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({
      email: 'ada@example.com',
      username: 'ada_lovelace',
      displayName: 'Ada Lovelace',
      role: 'USER',
    });
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
    expect(res.body.data.tokens).toMatchObject({ tokenType: 'Bearer', expiresIn: 900 });

    const stored = await prisma.user.findUniqueOrThrow({ where: { username: 'ada_lovelace' } });
    expect(stored.passwordHash).not.toBe(validUser.password);
  });

  it('usa el username como displayName por defecto', async () => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ email: 'b@example.com', username: 'bob', password: 'Passw0rd' });
    expect(res.body.data.user.displayName).toBe('bob');
  });

  it('valida los campos y devuelve detalles', async () => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ email: 'no-es-email', username: 'a!', password: 'corta' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['email', 'username', 'password']));
  });

  it('exige letras y números en la contraseña', async () => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ ...validUser, password: 'solamenteletras' });
    expect(res.status).toBe(400);
  });

  it('devuelve 409 si el email o el username ya existen', async () => {
    await api().post('/api/v1/auth/register').send(validUser);

    const res = await api()
      .post('/api/v1/auth/register')
      .send({ ...validUser, username: 'otro' });
    expect(res.status).toBe(409);
    expect(res.body.error.details).toEqual([
      { path: 'email', message: 'El email ya está registrado' },
    ]);
  });
});

describe('POST /api/v1/auth/login', () => {
  it('inicia sesión con credenciales correctas (email sin distinguir mayúsculas)', async () => {
    await api().post('/api/v1/auth/register').send(validUser);
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'ADA@example.com', password: validUser.password });

    expect(res.status).toBe(200);
    expect(res.body.data.tokens.accessToken).toBeTruthy();
  });

  it('devuelve el mismo 401 para contraseña incorrecta y usuario inexistente', async () => {
    await api().post('/api/v1/auth/register').send(validUser);

    const wrongPassword = await api()
      .post('/api/v1/auth/login')
      .send({ email: validUser.email, password: 'Incorrecta1' });
    const unknownUser = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'nadie@example.com', password: 'Incorrecta1' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe(unknownUser.body.error.message);
  });
});

describe('GET /api/v1/auth/me', () => {
  it('devuelve el usuario autenticado', async () => {
    const user = await createUser();
    const res = await api().get('/api/v1/auth/me').set(bearer(user));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: user.id, email: user.email });
  });

  it('rechaza peticiones sin token, con formato inválido o con token falso', async () => {
    expect((await api().get('/api/v1/auth/me')).status).toBe(401);
    expect((await api().get('/api/v1/auth/me').set('Authorization', 'Token abc')).status).toBe(401);
    expect(
      (await api().get('/api/v1/auth/me').set('Authorization', 'Bearer abc.def.ghi')).status,
    ).toBe(401);
  });

  it('rechaza el token de un usuario eliminado', async () => {
    const user = await createUser();
    await prisma.user.delete({ where: { id: user.id } });
    expect((await api().get('/api/v1/auth/me').set(bearer(user))).status).toBe(401);
  });
});

describe('Refresh tokens', () => {
  it('rota el refresh token y el anterior deja de ser válido', async () => {
    const user = await createUser();

    const first = await api()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: user.refreshToken });
    expect(first.status).toBe(200);
    const rotated = first.body.data.tokens.refreshToken;
    expect(rotated).not.toBe(user.refreshToken);

    const second = await api().post('/api/v1/auth/refresh').send({ refreshToken: rotated });
    expect(second.status).toBe(200);
  });

  it('detecta reutilización y revoca todas las sesiones', async () => {
    const user = await createUser();
    const rotated = (
      await api().post('/api/v1/auth/refresh').send({ refreshToken: user.refreshToken })
    ).body.data.tokens.refreshToken;

    // Reutilizar el token original (posible robo).
    const reuse = await api()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: user.refreshToken });
    expect(reuse.status).toBe(401);

    // El token legítimo más reciente también queda revocado.
    const afterReuse = await api().post('/api/v1/auth/refresh').send({ refreshToken: rotated });
    expect(afterReuse.status).toBe(401);
  });

  it('rechaza tokens desconocidos y expirados', async () => {
    const user = await createUser();
    expect((await api().post('/api/v1/auth/refresh').send({ refreshToken: 'nope' })).status).toBe(
      401,
    );

    await prisma.refreshToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await api()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: user.refreshToken });
    expect(expired.status).toBe(401);
    expect(expired.body.error.message).toMatch(/expirado/);
  });

  it('logout revoca el refresh token y es idempotente', async () => {
    const user = await createUser();

    expect(
      (await api().post('/api/v1/auth/logout').send({ refreshToken: user.refreshToken })).status,
    ).toBe(204);
    expect(
      (await api().post('/api/v1/auth/logout').send({ refreshToken: user.refreshToken })).status,
    ).toBe(204);
    expect(
      (await api().post('/api/v1/auth/refresh').send({ refreshToken: user.refreshToken })).status,
    ).toBe(401);
  });
});
