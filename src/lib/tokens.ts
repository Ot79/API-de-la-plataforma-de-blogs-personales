import { createHash, randomBytes } from 'node:crypto';

import jwt from 'jsonwebtoken';

import { env } from '../config/env';
import type { Role } from '../generated/prisma/client';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
}

const JWT_ALGORITHM = 'HS256';
const JWT_ISSUER = 'blogging-platform-api';

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    algorithm: JWT_ALGORITHM,
    issuer: JWT_ISSUER,
    expiresIn: accessTokenTtlSeconds(),
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    algorithms: [JWT_ALGORITHM],
    issuer: JWT_ISSUER,
  });

  if (typeof decoded === 'string' || typeof decoded.sub !== 'string') {
    throw new jwt.JsonWebTokenError('Payload de token inválido');
  }

  return { sub: decoded.sub, role: decoded.role as Role };
}

/**
 * Segundos de validez del access token. Un valor sin unidad se interpreta
 * como segundos (p. ej. "900").
 */
export function accessTokenTtlSeconds(): number {
  const match = /^(\d+)(ms|s|m|h|d)?$/.exec(env.JWT_ACCESS_EXPIRES_IN);
  if (!match) throw new Error('JWT_ACCESS_EXPIRES_IN inválido');
  const value = Number(match[1]);
  const unit = match[2] ?? 's';
  const factor: Record<string, number> = { ms: 0.001, s: 1, m: 60, h: 3600, d: 86400 };
  return Math.max(1, Math.floor(value * (factor[unit] ?? 1)));
}

/** Genera un refresh token opaco y aleatorio (se entrega al cliente en claro). */
export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

/** Solo se persiste el hash SHA-256 del refresh token. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
