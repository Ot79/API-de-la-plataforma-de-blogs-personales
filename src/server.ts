import { createApp } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main() {
  await prisma.$connect();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`API escuchando en http://localhost:${env.PORT} (docs en /docs)`);
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Cerrando servidor...');

    const forceExit = setTimeout(() => {
      logger.error('Cierre forzado tras agotar el tiempo de espera');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    server.close(async (err) => {
      await prisma.$disconnect();
      if (err) {
        logger.error({ err }, 'Error al cerrar el servidor');
        process.exit(1);
      }
      logger.info('Servidor cerrado correctamente');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Promesa rechazada sin manejar');
  process.exit(1);
});

main().catch((err) => {
  logger.fatal({ err }, 'No se pudo iniciar la aplicación');
  process.exit(1);
});
