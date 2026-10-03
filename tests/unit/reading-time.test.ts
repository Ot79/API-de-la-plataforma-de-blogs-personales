import { describe, expect, it } from 'vitest';

import { buildExcerpt, readingTimeMinutes } from '../../src/lib/reading-time';

describe('readingTimeMinutes', () => {
  it('devuelve al menos 1 minuto', () => {
    expect(readingTimeMinutes('')).toBe(1);
    expect(readingTimeMinutes('hola mundo')).toBe(1);
  });

  it('calcula minutos a 200 palabras por minuto', () => {
    expect(readingTimeMinutes('palabra '.repeat(200))).toBe(1);
    expect(readingTimeMinutes('palabra '.repeat(201))).toBe(2);
    expect(readingTimeMinutes('palabra '.repeat(1000))).toBe(5);
  });

  it('ignora los bloques de código', () => {
    const content = `texto\n\`\`\`js\n${'codigo '.repeat(1000)}\n\`\`\``;
    expect(readingTimeMinutes(content)).toBe(1);
  });
});

describe('buildExcerpt', () => {
  it('quita la sintaxis Markdown', () => {
    expect(buildExcerpt('# Título\n\nUn [enlace](https://x.dev) y **negrita**.')).toBe(
      'Título Un enlace y negrita.',
    );
  });

  it('trunca en un límite de palabra y añade elipsis', () => {
    const excerpt = buildExcerpt('palabra '.repeat(100), 50);
    expect(excerpt.length).toBeLessThanOrEqual(51);
    expect(excerpt.endsWith('…')).toBe(true);
    expect(excerpt).not.toMatch(/\s…$/);
  });

  it('no modifica textos cortos', () => {
    expect(buildExcerpt('Texto corto')).toBe('Texto corto');
  });
});
