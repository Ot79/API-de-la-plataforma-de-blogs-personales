import type { Role } from '../../generated/prisma/client';
import { AppError } from '../../lib/errors';
import { hashPassword, verifyPassword } from '../../lib/password';
import { prisma } from '../../lib/prisma';
import { revokeAllSessions } from '../auth/auth.service';
import { toPrivateUser, toPublicUser } from './users.mapper';
import type { ChangePasswordInput, UpdateProfileInput } from './users.schemas';

async function findUserOrThrow(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  // Un token válido de un usuario eliminado no debe dar acceso.
  if (!user) throw AppError.unauthorized('El usuario del token ya no existe');
  return user;
}

export async function getMe(userId: string) {
  return toPrivateUser(await findUserOrThrow(userId));
}

export async function getProfile(username: string) {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) throw AppError.notFound('Usuario');

  const publishedArticles = await prisma.article.count({
    where: { authorId: user.id, status: 'PUBLISHED' },
  });

  return { ...toPublicUser(user), publishedArticles };
}

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  await findUserOrThrow(userId);
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.displayName !== undefined && { displayName: input.displayName }),
      ...(input.bio !== undefined && { bio: input.bio || null }),
    },
  });
  return toPrivateUser(user);
}

/** Cambia la contraseña y cierra todas las sesiones abiertas. */
export async function changePassword(userId: string, input: ChangePasswordInput) {
  const user = await findUserOrThrow(userId);

  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw AppError.badRequest('La contraseña actual no es correcta', [
      { path: 'currentPassword', message: 'Contraseña incorrecta' },
    ]);
  }

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(input.newPassword) },
  });
  await revokeAllSessions(userId);
}

export async function changeRole(actorId: string, username: string, role: Role) {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) throw AppError.notFound('Usuario');
  if (user.id === actorId) {
    throw AppError.badRequest('No puedes cambiar tu propio rol');
  }

  const updated = await prisma.user.update({ where: { id: user.id }, data: { role } });
  // El rol va en el access token: se fuerzan nuevas sesiones para aplicarlo.
  await revokeAllSessions(user.id);
  return toPublicUser(updated);
}
