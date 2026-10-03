import { z } from 'zod';

export const tagNameSchema = z
  .string()
  .trim()
  .min(1, 'La etiqueta no puede estar vacía')
  .max(30, 'Máximo 30 caracteres por etiqueta')
  .meta({ example: 'node.js' });

export const categoryNameSchema = z.string().trim().min(1).max(50).meta({ example: 'Tecnología' });

export const tagSchema = z
  .object({ name: z.string(), slug: z.string() })
  .meta({ id: 'Tag', example: { name: 'Node.js', slug: 'node-js' } });

export const categorySchema = z
  .object({ name: z.string(), slug: z.string() })
  .meta({ id: 'Category', example: { name: 'Tecnología', slug: 'tecnologia' } });

export const tagWithCountSchema = tagSchema
  .extend({ articleCount: z.number().int() })
  .meta({ id: 'TagWithCount' });

export const categoryWithCountSchema = categorySchema
  .extend({ articleCount: z.number().int() })
  .meta({ id: 'CategoryWithCount' });
