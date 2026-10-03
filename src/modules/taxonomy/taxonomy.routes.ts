import { Router } from 'express';

import * as taxonomyService from './taxonomy.service';

export const tagsRouter = Router();
tagsRouter.get('/', async (_req, res) => {
  res.json({ data: await taxonomyService.listTags() });
});

export const categoriesRouter = Router();
categoriesRouter.get('/', async (_req, res) => {
  res.json({ data: await taxonomyService.listCategories() });
});
