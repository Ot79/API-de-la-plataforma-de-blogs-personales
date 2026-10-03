import { z } from 'zod';

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Mínimo 3 caracteres')
  .max(30, 'Máximo 30 caracteres')
  .regex(/^[a-z0-9_]+$/, 'Solo letras, números y guiones bajos')
  .meta({ example: 'ada_lovelace' });

export const passwordSchema = z
  .string()
  .min(8, 'Mínimo 8 caracteres')
  .max(72, 'Máximo 72 caracteres')
  .regex(/[A-Za-z]/, 'Debe contener al menos una letra')
  .regex(/\d/, 'Debe contener al menos un número')
  .meta({ example: 'Sup3rSecreta' });

export const displayNameSchema = z.string().trim().min(1).max(60).meta({ example: 'Ada Lovelace' });

export const bioSchema = z
  .string()
  .trim()
  .max(500)
  .meta({ example: 'Escribo sobre backend y bases de datos.' });

export const roleSchema = z.enum(['USER', 'ADMIN']).meta({ id: 'Role' });

export const authorSummarySchema = z
  .object({
    id: z.uuid(),
    username: z.string(),
    displayName: z.string(),
  })
  .meta({ id: 'AuthorSummary' });

export const publicUserSchema = z
  .object({
    id: z.uuid(),
    username: z.string(),
    displayName: z.string(),
    bio: z.string().nullable(),
    role: roleSchema,
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'PublicUser' });

export const userProfileSchema = publicUserSchema
  .extend({ publishedArticles: z.number().int() })
  .meta({ id: 'UserProfile' });

export const privateUserSchema = publicUserSchema
  .extend({ email: z.email(), updatedAt: z.iso.datetime() })
  .meta({ id: 'PrivateUser' });

export const usernameParams = z.object({ username: usernameSchema });

export const updateProfileBody = z
  .object({
    displayName: displayNameSchema.optional(),
    bio: bioSchema.nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, 'Debes enviar al menos un campo')
  .meta({ id: 'UpdateProfileInput' });

export const changePasswordBody = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: passwordSchema,
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'La nueva contraseña debe ser distinta de la actual',
    path: ['newPassword'],
  })
  .meta({ id: 'ChangePasswordInput' });

export const changeRoleBody = z.object({ role: roleSchema }).meta({ id: 'ChangeRoleInput' });

export type UpdateProfileInput = z.infer<typeof updateProfileBody>;
export type ChangePasswordInput = z.infer<typeof changePasswordBody>;
