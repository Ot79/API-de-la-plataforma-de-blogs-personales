import bcrypt from 'bcryptjs';

import { isTest } from '../config/env';

// En tests se reduce el coste para mantener la suite rápida.
const SALT_ROUNDS = isTest ? 4 : 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
