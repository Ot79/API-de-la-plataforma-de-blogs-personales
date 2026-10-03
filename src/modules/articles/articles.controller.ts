import type { Request, Response } from 'express';

import { requireUser } from '../../middlewares/auth';
import {
  articleIdParams,
  articleLookupParams,
  createArticleBody,
  listArticlesQuery,
  replaceArticleBody,
  updateArticleBody,
} from './articles.schemas';
import * as articlesService from './articles.service';

export async function list(req: Request, res: Response) {
  const query = listArticlesQuery.parse(req.query);
  res.json(await articlesService.listArticles(query, req.user));
}

export async function getOne(req: Request, res: Response) {
  const { idOrSlug } = articleLookupParams.parse(req.params);
  res.json({ data: await articlesService.getArticle(idOrSlug, req.user) });
}

export async function create(req: Request, res: Response) {
  const user = requireUser(req);
  const input = createArticleBody.parse(req.body);
  const article = await articlesService.createArticle(input, user);
  res.status(201).location(`${req.baseUrl}/${article.id}`).json({ data: article });
}

export async function replace(req: Request, res: Response) {
  const user = requireUser(req);
  const { id } = articleIdParams.parse(req.params);
  const input = replaceArticleBody.parse(req.body);
  res.json({ data: await articlesService.updateArticle(id, input, user, { replace: true }) });
}

export async function update(req: Request, res: Response) {
  const user = requireUser(req);
  const { id } = articleIdParams.parse(req.params);
  const input = updateArticleBody.parse(req.body);
  res.json({ data: await articlesService.updateArticle(id, input, user) });
}

export async function remove(req: Request, res: Response) {
  const user = requireUser(req);
  const { id } = articleIdParams.parse(req.params);
  await articlesService.deleteArticle(id, user);
  res.status(204).end();
}
