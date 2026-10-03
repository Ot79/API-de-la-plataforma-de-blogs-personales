import { Router } from 'express';

import { authenticate } from '../../middlewares/auth';
import * as controller from './comments.controller';

export const commentsRouter = Router();

commentsRouter.patch('/:id', authenticate, controller.update);
commentsRouter.delete('/:id', authenticate, controller.remove);
