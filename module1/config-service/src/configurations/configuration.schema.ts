import { z } from 'zod';

/** A JSON object of name/value pairs (stored as jsonb). */
const configObject = z.record(z.string(), z.unknown());

/** Body for POST /configurations */
export const createConfigurationSchema = z.object({
  applicationId: z.string().min(1),
  name: z.string().min(1).max(256),
  comments: z.string().max(1024).optional(),
  config: configObject,
});
export type CreateConfigurationInput = z.infer<typeof createConfigurationSchema>;

/** Body for PUT /configurations/:id — partial update; at least one field required. */
export const updateConfigurationSchema = z
  .object({
    name: z.string().min(1).max(256).optional(),
    comments: z.string().max(1024).nullable().optional(),
    config: configObject.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field must be provided',
  });
export type UpdateConfigurationInput = z.infer<typeof updateConfigurationSchema>;

/** Path params carrying an id. */
export const idParamSchema = z.object({
  id: z.string().min(1),
});
