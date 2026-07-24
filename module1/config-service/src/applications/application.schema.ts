import { z } from 'zod';

/** Body for POST /applications */
export const createApplicationSchema = z.object({
  name: z.string().min(1).max(256),
  comments: z.string().max(1024).optional(),
});
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;

/** Body for PUT /applications/:id — partial update; at least one field required. */
export const updateApplicationSchema = z
  .object({
    name: z.string().min(1).max(256).optional(),
    comments: z.string().max(1024).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field must be provided',
  });
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;

/** Path params carrying an id. */
export const idParamSchema = z.object({
  id: z.string().min(1),
});
