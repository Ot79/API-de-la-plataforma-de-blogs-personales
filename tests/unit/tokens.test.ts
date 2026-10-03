import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';

import {
  accessTokenTtlSeconds,
  generateRefreshToken,
  hashToken,
  signAccessToken,
  verifyAccessToken,
} from '../../src/lib/tokens';

describe('access tokens', () => {
  it('firma y verifica un token con sub y role', () => {
    const token = signAccessToken({ sub: 'user-id', role: 'ADMIN' });
    expect(verifyAccessToken(token)).toEqual({ sub: 'user-id', role: 'ADMIN' });
  });

  it('rechaza tokens firmados con otro secreto', () => {
    const forged = jwt.sign({ sub: 'x', role: 'ADMIN' }, 'otro-secreto-cualquiera-de-32-chars!!', {
      issuer: 'blogging-platform-api',
    });
    expect(() => verifyAccessToken(forged)).toThrow();
  });

  it('rechaza el algoritmo "none"', () => {
    const unsigned = jwt.sign({ sub: 'x', role: 'ADMIN' }, '', {
      algorithm: 'none',
      issuer: 'blogging-platform-api',
    });
    expect(() => verifyAccessToken(unsigned)).toThrow();
  });

  it('interpreta la duración configurada (15m = 900 s)', () => {
    expect(accessTokenTtlSeconds()).toBe(900);
  });
});

describe('refresh tokens', () => {
  it('genera tokens aleatorios distintos', () => {
    expect(generateRefreshToken()).not.toBe(generateRefreshToken());
    expect(generateRefreshToken().length).toBeGreaterThanOrEqual(64);
  });

  it('hashea de forma determinista con SHA-256', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).toMatch(/^[0-9a-f]{64}$/);
  });
});
