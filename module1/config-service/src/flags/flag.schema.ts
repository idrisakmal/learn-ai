import { z } from 'zod';

/**
 * Body for POST /flags.
 *
 * `enabled` is required: a flag whose state nobody decided is not a flag, and a
 * default here would let a caller create one by accident.
 */
export const createFlagSchema = z.object({
  applicationId: z.string().min(1),
  name: z.string().min(1).max(256),
  enabled: z.boolean(),
});
export type CreateFlagInput = z.infer<typeof createFlagSchema>;

/**
 * Body for PUT /flags/:id — partial update; at least one field required.
 *
 * `applicationId` is deliberately absent: moving a flag to another application
 * is not a toggle, and would need a parent-exists check plus a fresh uniqueness
 * check in the destination.
 */
export const updateFlagSchema = z
  .object({
    name: z.string().min(1).max(256).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field must be provided',
  });
export type UpdateFlagInput = z.infer<typeof updateFlagSchema>;

/** Path params carrying an id. */
export const idParamSchema = z.object({
  id: z.string().min(1),
});
