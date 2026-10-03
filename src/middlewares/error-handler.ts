import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

import { Prisma } from '../generated/prisma/client';
import { AppError, type ErrorDetail } from '../lib/errors';
import { logger } from '../lib/logger';
import { uniqueViolationFields } from '../lib/prisma-errors';

function zodDetails(error: ZodError): ErrorDetail[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

/** Traduce errores conocidos de Prisma a errores HTTP. */
function fromPrismaError(error: Prisma.PrismaClientKnownRequestError): AppError | undefined {
  switch (error.code) {
    case 'P2002': {
      const fields = uniqueViolationFields(error)?.join(', ') || 'campo único';
      return AppError.conflict(`Ya existe un registro con ese valor (${fields})`);
    }
    case 'P2003':
      return AppError.badRequest('La operación hace referencia a un registro inexistente');
    case 'P2025':
      return AppError.notFound();
    default:
      return undefined;
  }
}

function normalizeError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  if (err instanceof ZodError) {
    return new AppError(400, 'VALIDATION_ERROR', 'Datos de entrada inválidos', zodDetails(err));
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = fromPrismaError(err);
    if (mapped) return mapped;
  }

  // Errores de body-parser (JSON mal formado, payload demasiado grande).
  if (typeof err === 'object' && err !== null && 'type' in err) {
    const type = (err as { type?: string }).type;
    if (type === 'entity.parse.failed') {
      return AppError.badRequest('El cuerpo de la petición no es JSON válido');
    }
    if (type === 'entity.too.large') {
      return new AppError(413, 'PAYLOAD_TOO_LARGE', 'El cuerpo de la petición es demasiado grande');
    }
  }

  return new AppError(500, 'INTERNAL_ERROR', 'Error interno del servidor');
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', `Ruta ${req.method} ${req.path} no encontrada`));
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const appError = normalizeError(err);

  if (appError.statusCode >= 500) {
    logger.error({ err, requestId: req.id }, 'Error no controlado');
  }

  res.status(appError.statusCode).json({
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details ? { details: appError.details } : {}),
      requestId: req.id,
    },
  });
};
