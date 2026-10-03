import { z } from 'zod';

import {
  displayNameSchema,
  passwordSchema,
  privateUserSchema,
  usernameSchema,
} from '../users/users.schemas';

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Email inválido').max(254))
  .meta({ example: 'ada@example.com' });

export const registerBody = z
  .object({
    email: emailSchema,
    username: usernameSchema,
    password: passwordSchema,
    displayName: displayNameSchema.optional(),
  })
  .meta({ id: 'RegisterInput' });

export const loginBody = z
  .object({
    email: emailSchema,
    password: z.string().min(1, 'La contraseña es obligatoria').max(72),
  })
  .meta({ id: 'LoginInput' });

export const refreshBody = z
  .object({ refreshToken: z.string().min(1, 'refreshToken es obligatorio') })
  .meta({ id: 'RefreshInput' });

export const authTokensSchema = z
  .object({
    tokenType: z.literal('Bearer'),
    accessToken: z.string(),
    expiresIn: z.number().int().meta({ description: 'Segundos de validez del access token' }),
    refreshToken: z.string(),
    refreshTokenExpiresAt: z.iso.datetime(),
  })
  .meta({ id: 'AuthTokens' });

export const authResultSchema = z
  .object({ user: privateUserSchema, tokens: authTokensSchema })
  .meta({ id: 'AuthResult' });

export type RegisterInput = z.infer<typeof registerBody>;
export type LoginInput = z.infer<typeof loginBody>;
