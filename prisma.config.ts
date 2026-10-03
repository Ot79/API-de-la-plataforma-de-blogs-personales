import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // `prisma generate` no necesita conexión: así `npm install` funciona sin .env.
    // Los comandos de migración fallarán con un error claro si falta la variable.
    url: process.env.DATABASE_URL ?? '',
  },
});
