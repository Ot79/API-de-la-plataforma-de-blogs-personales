import { Prisma } from '../generated/prisma/client';

interface UniqueViolationMeta {
  target?: string[] | string;
  driverAdapterError?: {
    cause?: { constraint?: { fields?: string[]; index?: string }; table?: string };
  };
}

/**
 * Devuelve los campos implicados en una violación de restricción única (P2002)
 * o `undefined` si el error es de otro tipo. Contempla tanto el formato clásico
 * (`meta.target`) como el de los driver adapters (`meta.driverAdapterError`).
 */
export function uniqueViolationFields(error: unknown): string[] | undefined {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return undefined;
  }

  const meta = (error.meta ?? {}) as UniqueViolationMeta;
  if (meta.target) return Array.isArray(meta.target) ? meta.target : [meta.target];

  const cause = meta.driverAdapterError?.cause;
  if (cause?.constraint?.fields?.length) return cause.constraint.fields;

  // Nombre de índice por convención de Prisma: <tabla>_<campos>_key
  const index = cause?.constraint?.index;
  if (index) {
    const withoutTable = cause?.table ? index.replace(`${cause.table}_`, '') : index;
    return [withoutTable.replace(/_key$/, '')];
  }

  return [];
}
