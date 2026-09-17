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

const optionalUrl = (label: string) =>
  z.string().trim().url(`${label} must be a valid URL`).max(500).nullish();

/**
 * Role-aware profile payload: candidate fields and company fields live in one schema,
 * and the service rejects fields that do not belong to the caller's role.
 */
export const updateProfileSchema = z.object({
  body: z
    .object({
      // Candidate (developer) profile fields
      phone: z.string().trim().min(5, 'Phone must be at least 5 characters').max(20).nullish(),
      headline: z.string().trim().min(3, 'Headline must be at least 3 characters').max(150).nullish(),
      bio: z.string().trim().min(10, 'Bio must be at least 10 characters').max(2000).nullish(),
      skills: z.array(z.string().trim().min(1).max(40)).max(30, 'At most 30 skills').optional(),
      experienceYears: z.coerce.number().int().min(0).max(60).nullish(),
      githubUrl: optionalUrl('githubUrl'),
      linkedinUrl: optionalUrl('linkedinUrl'),
      portfolioUrl: optionalUrl('portfolioUrl'),
      // Recruiter (company) profile fields
      companyName: z.string().trim().min(2, 'Company name must be at least 2 characters').max(150).optional(),
      companyWebsite: optionalUrl('companyWebsite'),
      companyLogoUrl: optionalUrl('companyLogoUrl'),
      designation: z.string().trim().min(2).max(100).nullish(),
    })
    .refine((v) => Object.values(v).some((x) => x !== undefined), {
      message: 'Provide at least one field to update',
    }),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>['body'];
