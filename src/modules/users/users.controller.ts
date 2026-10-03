import type { Request, Response } from 'express';

import { requireUser } from '../../middlewares/auth';
import {
  changePasswordBody,
  changeRoleBody,
  updateProfileBody,
  usernameParams,
} from './users.schemas';
import * as usersService from './users.service';

export async function getProfile(req: Request, res: Response) {
  const { username } = usernameParams.parse(req.params);
  res.json({ data: await usersService.getProfile(username) });
}

export async function updateMe(req: Request, res: Response) {
  const user = requireUser(req);
  const input = updateProfileBody.parse(req.body);
  res.json({ data: await usersService.updateProfile(user.id, input) });
}

export async function changePassword(req: Request, res: Response) {
  const user = requireUser(req);
  const input = changePasswordBody.parse(req.body);
  await usersService.changePassword(user.id, input);
  res.status(204).end();
}

export async function changeRole(req: Request, res: Response) {
  const actor = requireUser(req);
  const { username } = usernameParams.parse(req.params);
  const { role } = changeRoleBody.parse(req.body);
  res.json({ data: await usersService.changeRole(actor.id, username, role) });
}
