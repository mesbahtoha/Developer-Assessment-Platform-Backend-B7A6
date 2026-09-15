import { z } from 'zod';

export const updateMeSchema = z.object({
  body: z
    .object({
      name: z.string().min(2, 'Name must be at least 2 characters').max(100).optional(),
      avatarUrl: z.string().url('avatarUrl must be a valid URL').max(500).nullish(),
    })
    .refine((v) => v.name !== undefined || v.avatarUrl !== undefined, {
      message: 'Provide at least one field to update (name, avatarUrl)',
    }),
});

export type UpdateMeInput = z.infer<typeof updateMeSchema>['body'];
