import { Router } from 'express';

import { authenticate, requireRole } from '../../middlewares/auth';
import * as controller from './users.controller';

export const usersRouter = Router();

usersRouter.patch('/me', authenticate, controller.updateMe);
usersRouter.put('/me/password', authenticate, controller.changePassword);
usersRouter.get('/:username', controller.getProfile);
usersRouter.patch('/:username/role', authenticate, requireRole('ADMIN'), controller.changeRole);
