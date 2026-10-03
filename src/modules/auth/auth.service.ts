import { env } from '../../config/env';
import type { Role, User } from '../../generated/prisma/client';
import { AppError } from '../../lib/errors';
import { hashPassword, verifyPassword } from '../../lib/password';
import { prisma } from '../../lib/prisma';
import {
  accessTokenTtlSeconds,
  generateRefreshToken,
  hashToken,
  signAccessToken,
} from '../../lib/tokens';
import { toPrivateUser } from '../users/users.mapper';
import type { LoginInput, RegisterInput } from './auth.schemas';

// Hash ficticio para igualar el tiempo de respuesta cuando el email no existe
// y no revelar qué cuentas están registradas. Usa el mismo coste que los reales.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword('dummy-password-never-matches-1'));

async function issueTokens(userId: string, role: Role) {
  const refreshToken = generateRefreshToken();
  const refreshTokenExpiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);

  await prisma.refreshToken.create({
    data: { userId, tokenHash: hashToken(refreshToken), expiresAt: refreshTokenExpiresAt },
  });

  return {
    tokenType: 'Bearer' as const,
    accessToken: signAccessToken({ sub: userId, role }),
    expiresIn: accessTokenTtlSeconds(),
    refreshToken,
    refreshTokenExpiresAt: refreshTokenExpiresAt.toISOString(),
  };
}

function authResult(user: User, tokens: Awaited<ReturnType<typeof issueTokens>>) {
  return { user: toPrivateUser(user), tokens };
}

export async function register(input: RegisterInput) {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: input.email }, { username: input.username }] },
    select: { email: true, username: true },
  });

  if (existing) {
    const details = [];
    if (existing.email === input.email) {
      details.push({ path: 'email', message: 'El email ya está registrado' });
    }
    if (existing.username === input.username) {
      details.push({ path: 'username', message: 'El nombre de usuario ya está en uso' });
    }
    throw AppError.conflict('El usuario ya existe', details);
  }

  const user = await prisma.user.create({
    data: {
      email: input.email,
      username: input.username,
      displayName: input.displayName ?? input.username,
      passwordHash: await hashPassword(input.password),
    },
  });

  return authResult(user, await issueTokens(user.id, user.role));
}

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const valid = await verifyPassword(input.password, user?.passwordHash ?? (await getDummyHash()));

  if (!user || !valid) {
    throw AppError.unauthorized('Credenciales inválidas');
  }

  return authResult(user, await issueTokens(user.id, user.role));
}

/**
 * Rota el refresh token: el token usado se revoca y se emite uno nuevo.
 * Si se presenta un token ya revocado se asume robo y se revocan todas las
 * sesiones del usuario (detección de reutilización).
 */
export async function refresh(refreshToken: string) {
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
    include: { user: true },
  });

  if (!stored) throw AppError.unauthorized('Refresh token inválido');

  if (stored.revokedAt) {
    await revokeAllSessions(stored.userId);
    throw AppError.unauthorized('Refresh token reutilizado; se han cerrado todas las sesiones');
  }

  if (stored.expiresAt <= new Date()) {
    throw AppError.unauthorized('Refresh token expirado');
  }

  // updateMany condicionado evita que dos peticiones concurrentes roten el mismo token.
  const { count } = await prisma.refreshToken.updateMany({
    where: { id: stored.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (count === 0) {
    await revokeAllSessions(stored.userId);
    throw AppError.unauthorized('Refresh token reutilizado; se han cerrado todas las sesiones');
  }

  return authResult(stored.user, await issueTokens(stored.user.id, stored.user.role));
}

/** Revoca un refresh token. Es idempotente: no falla si no existe. */
export async function logout(refreshToken: string) {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllSessions(userId: string) {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
