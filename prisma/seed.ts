/**
 * Datos de ejemplo para desarrollo. Ejecutar con `npm run db:seed`.
 * Es idempotente: borra los datos existentes antes de insertar.
 */
import { hashPassword } from '../src/lib/password';
import { prisma } from '../src/lib/prisma';
import { buildExcerpt, readingTimeMinutes } from '../src/lib/reading-time';
import { slugify } from '../src/lib/slug';
import { upsertCategory, upsertTags } from '../src/modules/taxonomy/taxonomy.service';

const DEMO_PASSWORD = 'Passw0rd!';

const articles = [
  {
    title: 'Cómo diseñar una API REST que no odies en seis meses',
    category: 'Backend',
    tags: ['API', 'REST', 'Arquitectura'],
    status: 'PUBLISHED' as const,
    daysAgo: 30,
    content: `## Recursos, no acciones

Una buena API REST modela **recursos** (\`/articles\`, \`/users\`) y usa los verbos HTTP para expresar la acción.

## Códigos de estado con significado

- \`201 Created\` al crear, con cabecera \`Location\`.
- \`204 No Content\` al borrar.
- \`409 Conflict\` cuando el estado actual lo impide.

## Errores consistentes

Devuelve siempre la misma forma de error, con un código legible por máquinas y un identificador de petición para poder rastrear el problema en los logs.`,
  },
  {
    title: 'PostgreSQL: índices que de verdad aceleran tus consultas',
    category: 'Bases de datos',
    tags: ['PostgreSQL', 'Rendimiento'],
    status: 'PUBLISHED' as const,
    daysAgo: 14,
    content: `## B-tree por defecto

La mayoría de consultas por igualdad o rango se benefician de un índice B-tree.

## Índices compuestos

El orden de las columnas importa: un índice \`(status, published_at)\` sirve para filtrar por estado y ordenar por fecha.

## Mide antes de optimizar

Usa \`EXPLAIN ANALYZE\` para confirmar que el planificador usa el índice.`,
  },
  {
    title: 'JWT y refresh tokens: rotación y detección de reutilización',
    category: 'Seguridad',
    tags: ['JWT', 'Seguridad', 'Node.js'],
    status: 'PUBLISHED' as const,
    daysAgo: 3,
    content: `Los access tokens deben ser de vida corta. Para no obligar al usuario a iniciar sesión constantemente se usa un **refresh token** opaco.

Cada vez que se usa, se revoca y se emite uno nuevo (rotación). Si alguien presenta un token ya revocado, es señal de robo: se cierran todas las sesiones del usuario.`,
  },
  {
    title: 'Notas sobre el event loop de Node.js',
    category: 'Backend',
    tags: ['Node.js', 'JavaScript'],
    status: 'DRAFT' as const,
    daysAgo: 0,
    content: 'Borrador: fases del event loop, microtareas y por qué no bloquear el hilo principal.',
  },
];

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.SEED_FORCE !== 'true') {
    throw new Error('El seed borra todos los datos. En producción exige SEED_FORCE=true.');
  }

  console.log('Limpiando datos existentes...');
  await prisma.$transaction([
    prisma.comment.deleteMany(),
    prisma.articleTag.deleteMany(),
    prisma.article.deleteMany(),
    prisma.tag.deleteMany(),
    prisma.category.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const admin = await prisma.user.create({
    data: {
      email: 'admin@example.com',
      username: 'admin',
      displayName: 'Administrador',
      role: 'ADMIN',
      passwordHash,
    },
  });
  const author = await prisma.user.create({
    data: {
      email: 'ada@example.com',
      username: 'ada',
      displayName: 'Ada Lovelace',
      bio: 'Escribo sobre backend, bases de datos y seguridad.',
      passwordHash,
    },
  });
  const reader = await prisma.user.create({
    data: { email: 'linus@example.com', username: 'linus', displayName: 'Linus', passwordHash },
  });

  for (const item of articles) {
    const publishedAt =
      item.status === 'PUBLISHED' ? new Date(Date.now() - item.daysAgo * 86_400_000) : null;

    const article = await prisma.$transaction(async (tx) => {
      const tagIds = await upsertTags(tx, item.tags);
      const categoryId = await upsertCategory(tx, item.category);
      return tx.article.create({
        data: {
          title: item.title,
          slug: slugify(item.title),
          content: item.content,
          excerpt: buildExcerpt(item.content),
          readingTimeMinutes: readingTimeMinutes(item.content),
          status: item.status,
          publishedAt,
          createdAt: publishedAt ?? new Date(),
          authorId: author.id,
          categoryId,
          tags: { create: tagIds.map((tagId) => ({ tagId })) },
        },
      });
    });

    if (item.status === 'PUBLISHED') {
      await prisma.comment.createMany({
        data: [
          { articleId: article.id, authorId: reader.id, content: '¡Muy útil, gracias!' },
          { articleId: article.id, authorId: admin.id, content: 'Gran artículo.' },
        ],
      });
    }
  }

  console.log('Seed completado. Usuarios de demo (contraseña "%s"):', DEMO_PASSWORD);
  console.table([
    { email: admin.email, username: admin.username, role: admin.role },
    { email: author.email, username: author.username, role: author.role },
    { email: reader.email, username: reader.username, role: reader.role },
  ]);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
