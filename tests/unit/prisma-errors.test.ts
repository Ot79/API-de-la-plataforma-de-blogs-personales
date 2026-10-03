import { describe, expect, it } from 'vitest';

import { Prisma } from '../../src/generated/prisma/client';
import { uniqueViolationFields } from '../../src/lib/prisma-errors';

const knownError = (code: string, meta: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('error', { code, clientVersion: 'test', meta });

describe('uniqueViolationFields', () => {
  it('lee meta.target (formato clásico)', () => {
    expect(uniqueViolationFields(knownError('P2002', { target: ['email'] }))).toEqual(['email']);
    expect(uniqueViolationFields(knownError('P2002', { target: 'slug' }))).toEqual(['slug']);
  });

  it('lee los campos del driver adapter', () => {
    const error = knownError('P2002', {
      driverAdapterError: { cause: { constraint: { fields: ['username'] } } },
    });
    expect(uniqueViolationFields(error)).toEqual(['username']);
  });

  it('deduce el campo a partir del nombre del índice', () => {
    const error = knownError('P2002', {
      driverAdapterError: {
        cause: { constraint: { index: 'articles_slug_key' }, table: 'articles' },
      },
    });
    expect(uniqueViolationFields(error)).toEqual(['slug']);
  });

  it('devuelve undefined para otros errores', () => {
    expect(uniqueViolationFields(knownError('P2025', {}))).toBeUndefined();
    expect(uniqueViolationFields(new Error('x'))).toBeUndefined();
  });
});
