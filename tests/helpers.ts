import request from 'supertest';

import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';

export const app = createApp();
export const api = () => request(app);

let counter = 0;

export interface TestUser {
  id: string;
  username: string;
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
}

/** Registra un usuario (opcionalmente ADMIN) y devuelve sus credenciales. */
export async function createUser(
  overrides: Partial<{ username: string; email: string; password: string; role: 'ADMIN' }> = {},
): Promise<TestUser> {
  counter += 1;
  const username = overrides.username ?? `user_${counter}`;
  const email = overrides.email ?? `${username}@example.com`;
  const password = overrides.password ?? 'Passw0rd!';

  const res = await api().post('/api/v1/auth/register').send({ username, email, password });
  if (res.status !== 201) throw new Error(`Registro fallido: ${JSON.stringify(res.body)}`);

  let { accessToken, refreshToken } = res.body.data.tokens;

  if (overrides.role === 'ADMIN') {
    await prisma.user.update({ where: { username }, data: { role: 'ADMIN' } });
    const login = await api().post('/api/v1/auth/login').send({ email, password });
    ({ accessToken, refreshToken } = login.body.data.tokens);
  }

  return { id: res.body.data.user.id, username, email, password, accessToken, refreshToken };
}

export const bearer = (user: Pick<TestUser, 'accessToken'>) => ({
  Authorization: `Bearer ${user.accessToken}`,
});

/** Crea un artículo vía API con valores por defecto razonables. */
export async function createArticle(
  user: TestUser,
  body: Record<string, unknown> = {},
): Promise<Record<string, unknown> & { id: string; slug: string }> {
  const res = await api()
    .post('/api/v1/articles')
    .set(bearer(user))
    .send({
      title: 'Artículo de prueba',
      content: 'Contenido de prueba para el artículo.',
      status: 'PUBLISHED',
      ...body,
    });
  if (res.status !== 201) throw new Error(`Creación fallida: ${JSON.stringify(res.body)}`);
  return res.body.data;
}
