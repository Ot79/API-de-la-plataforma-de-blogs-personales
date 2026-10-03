export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'TOO_MANY_REQUESTS'
  | 'INTERNAL_ERROR';

export interface ErrorDetail {
  path: string;
  message: string;
}

/** Error de dominio con código HTTP y código legible por máquinas. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(message: string, details?: ErrorDetail[]) {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }

  static unauthorized(message = 'Autenticación requerida') {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'No tienes permiso para realizar esta acción') {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static notFound(resource = 'Recurso') {
    return new AppError(404, 'NOT_FOUND', `${resource} no encontrado`);
  }

  static conflict(message: string, details?: ErrorDetail[]) {
    return new AppError(409, 'CONFLICT', message, details);
  }
}
