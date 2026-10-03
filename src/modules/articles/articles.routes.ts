import { Router } from 'express';

import { authenticate, optionalAuth } from '../../middlewares/auth';
import * as commentsController from '../comments/comments.controller';
import * as controller from './articles.controller';

export const articlesRouter = Router();

articlesRouter.get('/', optionalAuth, controller.list);
articlesRouter.post('/', authenticate, controller.create);
articlesRouter.get('/:idOrSlug', optionalAuth, controller.getOne);
articlesRouter.put('/:id', authenticate, controller.replace);
articlesRouter.patch('/:id', authenticate, controller.update);
articlesRouter.delete('/:id', authenticate, controller.remove);

articlesRouter.get('/:id/comments', optionalAuth, commentsController.list);
articlesRouter.post('/:id/comments', authenticate, commentsController.create);
