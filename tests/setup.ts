import { afterAll, beforeEach } from 'vitest';

import { prisma } from '../src/lib/prisma';

const TABLES = [
  'comments',
  'article_tags',
  'articles',
  'tags',
  'categories',
  'refresh_tokens',
  'users',
];

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});
