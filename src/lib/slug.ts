/**
 * Convierte un texto en un slug apto para URLs:
 * "¡Hola, Señor Ñandú!" -> "hola-senor-nandu".
 */
export function slugify(input: string, maxLength = 80): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .replace(/[\s-]+/g, '-')
    .slice(0, maxLength)
    .replace(/^-+|-+$/g, '');
}

/**
 * Genera un slug único a partir de un texto base. `exists` indica si el
 * candidato ya está en uso; se añade un sufijo numérico incremental hasta
 * encontrar uno libre.
 */
export async function uniqueSlug(
  base: string,
  exists: (candidate: string) => Promise<boolean>,
  fallback = 'articulo',
): Promise<string> {
  const root = slugify(base) || fallback;
  let candidate = root;
  let suffix = 2;

  while (await exists(candidate)) {
    candidate = `${root}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}
