import { randomUUID } from 'node:crypto';

import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';

import { env, isTest } from './config/env';
import { openApiDocument } from './docs/openapi';
import { logger } from './lib/logger';
import { errorHandler, notFoundHandler } from './middlewares/error-handler';
import { apiRateLimiter } from './middlewares/rate-limit';
import { articlesRouter } from './modules/articles/articles.routes';
import { authRouter } from './modules/auth/auth.routes';
import { commentsRouter } from './modules/comments/comments.routes';
import { healthRouter } from './modules/health/health.routes';
import { categoriesRouter, tagsRouter } from './modules/taxonomy/taxonomy.routes';
import { usersRouter } from './modules/users/users.routes';

function corsOrigin(): cors.CorsOptions['origin'] {
  if (env.CORS_ORIGIN === '*') return '*';
  return env.CORS_ORIGIN.split(',').map((origin) => origin.trim());
}

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  // Solo se confía en X-Forwarded-For si hay proxies conocidos delante; si no,
  // cualquier cliente podría falsear su IP y saltarse el rate limiting.
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(
    pinoHttp({
      logger,
      // Reutiliza el X-Request-Id entrante (si es razonable) o genera uno nuevo.
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id =
          typeof incoming === 'string' && /^[\w-]{1,64}$/.test(incoming) ? incoming : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      // Los health checks se consultan con mucha frecuencia; no se registran.
      autoLogging: { ignore: (req) => isTest || (req.url ?? '').startsWith('/health') },
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
    }),
  );

  app.use(helmet());
  app.use(cors({ origin: corsOrigin(), exposedHeaders: ['X-Request-Id', 'Location'] }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/', (_req, res) => {
    res.json({
      name: 'Blogging Platform API',
      version: openApiDocument.info.version,
      docs: '/docs',
      health: '/health',
    });
  });
  app.use('/health', healthRouter);

  app.get('/docs/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });
  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, { customSiteTitle: 'Blogging Platform API' }),
  );

  const api = express.Router();
  api.use(apiRateLimiter);
  api.use('/auth', authRouter);
  api.use('/users', usersRouter);
  api.use('/articles', articlesRouter);
  api.use('/comments', commentsRouter);
  api.use('/tags', tagsRouter);
  api.use('/categories', categoriesRouter);
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
