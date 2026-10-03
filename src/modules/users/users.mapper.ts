import type { User } from '../../generated/prisma/client';

export function toPublicUser(user: User) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    bio: user.bio,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

export function toPrivateUser(user: User) {
  return {
    ...toPublicUser(user),
    email: user.email,
    updatedAt: user.updatedAt.toISOString(),
  };
}
