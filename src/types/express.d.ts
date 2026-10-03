import type { Role } from '../generated/prisma/client';

declare global {
  namespace Express {
    interface Request {
      /** Usuario autenticado, presente tras el middleware de autenticación. */
      user?: { id: string; role: Role };
    }
  }
}

export {};
