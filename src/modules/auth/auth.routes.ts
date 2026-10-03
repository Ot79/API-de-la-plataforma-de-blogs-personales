import { Router } from 'express';

import { authenticate } from '../../middlewares/auth';
import { authRateLimiter } from '../../middlewares/rate-limit';
import * as controller from './auth.controller';

export const authRouter = Router();

authRouter.post('/register', authRateLimiter, controller.register);
authRouter.post('/login', authRateLimiter, controller.login);
authRouter.post('/refresh', authRateLimiter, controller.refresh);
authRouter.post('/logout', controller.logout);
authRouter.get('/me', authenticate, controller.me);
