import { Prisma } from '@prisma/client';
import { ApiError } from '../../shared/catchAsync';
import prisma from '../../shared/prisma';
import { audit } from '../../shared/audit';
import { AuthUser } from '../../middlewares/auth';
import { UpdateMeInput, UpdateProfileInput } from './user.validation';

// Never select password in any user query
export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  avatarUrl: true,
  googleId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

const getMe = async (userId: string) => {
  const user = await prisma.user.findFirst({
    where: { id: userId, isDeleted: false },
    select: publicUserSelect,
  });
  if (!user) {
    throw ApiError.unauthorized('User no longer exists');
  }
  return user;
};

const updateMe = async (userId: string, input: UpdateMeInput) => {
  const data: Prisma.UserUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.avatarUrl !== undefined) data.avatarUrl = input.avatarUrl ?? null;

  return prisma.user.update({
    where: { id: userId },
    data,
    select: publicUserSelect,
  });
};

const CANDIDATE_FIELD_KEYS = [
  'phone',
  'headline',
  'bio',
  'skills',
  'experienceYears',
  'githubUrl',
  'linkedinUrl',
  'portfolioUrl',
] as const;

const COMPANY_FIELD_KEYS = ['companyName', 'companyWebsite', 'companyLogoUrl', 'designation'] as const;

/** Role-aware profile fetch (admins do not own a candidate/company profile). */
const getMyProfile = async (userId: string, role: AuthUser['role']) => {
  if (role === 'ADMIN') {
    return {
      profile: null,
      profileType: null,
      note: 'Admin accounts do not have a candidate or company profile',
    };
  }

  if (role === 'CANDIDATE') {
    const profile = await prisma.candidateProfile.findUnique({ where: { userId } });
    return { profile, profileType: 'CANDIDATE' as const };
  }

  const profile = await prisma.recruiterProfile.findUnique({ where: { userId } });
  return { profile, profileType: 'RECRUITER' as const };
};

/** Create-or-update the caller's profile, enforcing per-role field ownership. */
const updateMyProfile = async (userId: string, role: AuthUser['role'], input: UpdateProfileInput) => {
  if (role === 'ADMIN') {
    throw ApiError.badRequest('Admin accounts do not have a candidate or company profile');
  }

  const providedKeys = Object.entries(input)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);

  const forbidden = providedKeys.filter((key) =>
    role === 'CANDIDATE'
      ? (COMPANY_FIELD_KEYS as readonly string[]).includes(key)
      : (CANDIDATE_FIELD_KEYS as readonly string[]).includes(key)
  );
  if (forbidden.length > 0) {
    throw ApiError.badRequest(
      role === 'CANDIDATE'
        ? `Company fields are only available to recruiter profiles: ${forbidden.join(', ')}`
        : `Candidate fields are only available to candidate profiles: ${forbidden.join(', ')}`
    );
  }

  if (role === 'CANDIDATE') {
    const existing = await prisma.candidateProfile.findUnique({ where: { userId } });

    const profile = existing
      ? await prisma.candidateProfile.update({
          where: { userId },
          data: {
            ...(input.phone !== undefined ? { phone: input.phone } : {}),
            ...(input.headline !== undefined ? { headline: input.headline } : {}),
            ...(input.bio !== undefined ? { bio: input.bio } : {}),
            ...(input.skills !== undefined ? { skills: input.skills } : {}),
            ...(input.experienceYears !== undefined
              ? { experienceYears: input.experienceYears }
              : {}),
            ...(input.githubUrl !== undefined ? { githubUrl: input.githubUrl } : {}),
            ...(input.linkedinUrl !== undefined ? { linkedinUrl: input.linkedinUrl } : {}),
            ...(input.portfolioUrl !== undefined ? { portfolioUrl: input.portfolioUrl } : {}),
          },
        })
      : await prisma.candidateProfile.create({
          data: {
            userId,
            phone: input.phone ?? null,
            headline: input.headline ?? null,
            bio: input.bio ?? null,
            skills: input.skills ?? [],
            experienceYears: input.experienceYears ?? null,
            githubUrl: input.githubUrl ?? null,
            linkedinUrl: input.linkedinUrl ?? null,
            portfolioUrl: input.portfolioUrl ?? null,
          },
        });

    await audit({
      actorId: userId,
      action: 'CANDIDATE_PROFILE_UPDATED',
      targetType: 'USER',
      targetId: userId,
      meta: { fields: providedKeys },
    });
    return profile;
  }

  const existing = await prisma.recruiterProfile.findUnique({ where: { userId } });
  const companyName = input.companyName ?? existing?.companyName;
  if (!companyName) {
    throw ApiError.badRequest('companyName is required when creating a recruiter profile');
  }

  const profile = await prisma.recruiterProfile.upsert({
    where: { userId },
    update: {
      companyName,
      companyWebsite: input.companyWebsite,
      companyLogoUrl: input.companyLogoUrl,
      designation: input.designation,
    },
    create: {
      userId,
      companyName,
      companyWebsite: input.companyWebsite ?? null,
      companyLogoUrl: input.companyLogoUrl ?? null,
      designation: input.designation ?? null,
    },
  });

  await audit({
    actorId: userId,
    action: 'RECRUITER_PROFILE_UPDATED',
    targetType: 'USER',
    targetId: userId,
    meta: { fields: providedKeys },
  });
  return profile;
};

export const UserService = { getMe, updateMe, getMyProfile, updateMyProfile };
