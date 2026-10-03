import { type Options, rateLimit } from 'express-rate-limit';

import { env, isTest } from '../config/env';

const handler: Options['handler'] = (req, res, _next, options) => {
  res.status(options.statusCode).json({
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Demasiadas peticiones, inténtalo de nuevo más tarde',
      requestId: req.id,
    },
  });
};

const baseOptions: Partial<Options> = {
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  // Los tests de integración hacen muchas peticiones seguidas desde la misma IP.
  skip: () => isTest,
  handler,
};

/** Límite general para toda la API. */
export const apiRateLimiter = rateLimit({ ...baseOptions, limit: env.RATE_LIMIT_MAX });

/** Límite estricto para endpoints sensibles (login, registro, refresh). */
export const authRateLimiter = rateLimit({ ...baseOptions, limit: env.AUTH_RATE_LIMIT_MAX });
