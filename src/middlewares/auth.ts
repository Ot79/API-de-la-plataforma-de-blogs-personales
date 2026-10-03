import type { NextFunction, Request, Response } from 'express';

import type { Role } from '../generated/prisma/client';
import { AppError } from '../lib/errors';
import { verifyAccessToken } from '../lib/tokens';

function extractBearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header) return undefined;

  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw AppError.unauthorized('Formato de cabecera Authorization inválido');
  }
  return token;
}

function attachUser(req: Request, token: string) {
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
  } catch {
    throw AppError.unauthorized('Token inválido o expirado');
  }
}

/** Exige un access token válido. */
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  if (!token) throw AppError.unauthorized();
  attachUser(req, token);
  next();
}

/** Adjunta el usuario si hay token, pero permite peticiones anónimas. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  if (token) attachUser(req, token);
  next();
}

/** Restringe el acceso a los roles indicados. Debe ir tras `authenticate`. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw AppError.unauthorized();
    if (!roles.includes(req.user.role)) throw AppError.forbidden();
    next();
  };
}

/** Devuelve el usuario autenticado o lanza 401 (para usar en controladores). */
export function requireUser(req: Request) {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}
