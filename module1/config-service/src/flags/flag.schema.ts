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
