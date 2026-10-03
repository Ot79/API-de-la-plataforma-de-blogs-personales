import type { Request, Response } from 'express';

import { requireUser } from '../../middlewares/auth';
import { articleIdParams } from '../articles/articles.schemas';
import { commentBody, commentIdParams, listCommentsQuery } from './comments.schemas';
import * as commentsService from './comments.service';

export async function list(req: Request, res: Response) {
  const { id } = articleIdParams.parse(req.params);
  const query = listCommentsQuery.parse(req.query);
  res.json(await commentsService.listComments(id, query, req.user));
}

export async function create(req: Request, res: Response) {
  const user = requireUser(req);
  const { id } = articleIdParams.parse(req.params);
  const { content } = commentBody.parse(req.body);
  res.status(201).json({ data: await commentsService.createComment(id, content, user) });
}

export async function update(req: Request, res: Response) {
  const user = requireUser(req);
  const { id } = commentIdParams.parse(req.params);
  const { content } = commentBody.parse(req.body);
  res.json({ data: await commentsService.updateComment(id, content, user) });
}

export async function remove(req: Request, res: Response) {
  const user = requireUser(req);
  const { id } = commentIdParams.parse(req.params);
  await commentsService.deleteComment(id, user);
  res.status(204).end();
}
