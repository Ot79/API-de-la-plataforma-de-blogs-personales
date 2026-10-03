import { describe, expect, it } from 'vitest';

import { slugify, uniqueSlug } from '../../src/lib/slug';

describe('slugify', () => {
  it('elimina acentos, signos y normaliza espacios', () => {
    expect(slugify('¡Hola, Señor Ñandú!')).toBe('hola-senor-nandu');
    expect(slugify('  Node.js   &   TypeScript  ')).toBe('node-js-typescript');
  });

  it('colapsa guiones repetidos y recorta extremos', () => {
    expect(slugify('--a -- b--')).toBe('a-b');
  });

  it('respeta la longitud máxima sin dejar guiones finales', () => {
    const slug = slugify('palabra '.repeat(30), 20);
    expect(slug.length).toBeLessThanOrEqual(20);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('devuelve cadena vacía si no hay caracteres válidos', () => {
    expect(slugify('!!! ???')).toBe('');
  });
});

describe('uniqueSlug', () => {
  it('añade un sufijo incremental mientras el slug exista', async () => {
    const taken = new Set(['mi-post', 'mi-post-2']);
    await expect(uniqueSlug('Mi post', async (s) => taken.has(s))).resolves.toBe('mi-post-3');
  });

  it('usa el fallback cuando el texto no produce slug', async () => {
    await expect(uniqueSlug('???', async () => false)).resolves.toBe('articulo');
  });
});
