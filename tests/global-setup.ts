import { execSync } from 'node:child_process';

/** Aplica las migraciones a la base de datos de test antes de toda la suite. */
export default function setup() {
  const databaseUrl =
    process.env.TEST_DATABASE_URL ??
    'postgresql://postgres:postgres@localhost:5432/blog_test?schema=public';

  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });
}
