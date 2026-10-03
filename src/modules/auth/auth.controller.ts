import type { Request, Response } from 'express';

import { requireUser } from '../../middlewares/auth';
import * as usersService from '../users/users.service';
import { loginBody, refreshBody, registerBody } from './auth.schemas';
import * as authService from './auth.service';

export async function register(req: Request, res: Response) {
  const input = registerBody.parse(req.body);
  res.status(201).json({ data: await authService.register(input) });
}

export async function login(req: Request, res: Response) {
  const input = loginBody.parse(req.body);
  res.json({ data: await authService.login(input) });
}

export async function refresh(req: Request, res: Response) {
  const { refreshToken } = refreshBody.parse(req.body);
  res.json({ data: await authService.refresh(refreshToken) });
}

export async function logout(req: Request, res: Response) {
  const { refreshToken } = refreshBody.parse(req.body);
  await authService.logout(refreshToken);
  res.status(204).end();
}

export async function me(req: Request, res: Response) {
  const user = requireUser(req);
  res.json({ data: await usersService.getMe(user.id) });
}
