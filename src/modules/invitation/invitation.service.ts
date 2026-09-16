import { InvitationStatus, Prisma } from '@prisma/client';
import { ApiError } from '../../shared/catchAsync';
import { audit } from '../../shared/audit';
import prisma from '../../shared/prisma';
import { AuthUser } from '../../middlewares/auth';
import { ListInvitationsQuery, SendInvitationInput } from './invitation.validation';

const invitationInclude = {
  candidate: { select: { id: true, name: true, email: true } },
  invitedBy: { select: { id: true, name: true } },
  assessment: { select: { id: true, title: true, status: true, price: true } },
} satisfies Prisma.InvitationInclude;

const send = async (user: AuthUser, input: SendInvitationInput) => {
  const assessment = await prisma.assessment.findFirst({
    where: { id: input.assessmentId, isDeleted: false },
  });
  if (!assessment) throw ApiError.notFound('Assessment not found');
  if (user.role !== 'ADMIN' && assessment.recruiterId !== user.id) {
    throw ApiError.notFound('Assessment not found');
  }

  const candidate = await prisma.user.findFirst({
    where: { email: input.candidateEmail, isDeleted: false, role: 'CANDIDATE' },
  });
  if (!candidate) throw ApiError.notFound('Candidate with this email was not found');
  if (candidate.id === user.id) {
    throw ApiError.badRequest('You cannot invite yourself to an assessment');
  }

  const expiresAt =
    input.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  let invitation;
  try {
    invitation = await prisma.invitation.create({
      data: {
        assessmentId: assessment.id,
        candidateId: candidate.id,
        invitedById: user.id,
        status: InvitationStatus.PENDING,
        expiresAt,
      },
      include: invitationInclude,
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      // unique(assessmentId, candidateId) - no duplicate invitations
      throw ApiError.conflict('This candidate is already invited to this assessment');
    }
    throw e;
  }

  await audit({
    actorId: user.id,
    action: 'INVITATION_SENT',
    targetType: 'INVITATION',
    targetId: invitation.id,
    meta: { candidateId: candidate.id, assessmentId: assessment.id },
  });
  return invitation;
};

const list = async (user: AuthUser, query: ListInvitationsQuery) => {
  const where: Prisma.InvitationWhereInput = {};

  if (user.role === 'CANDIDATE') {
    where.candidateId = user.id;
  } else if (user.role === 'RECRUITER') {
    where.assessment = { recruiterId: user.id };
  }
  if (query.status) where.status = query.status;

  const [total, invitations] = await prisma.$transaction([
    prisma.invitation.count({ where }),
    prisma.invitation.findMany({
      where,
      include: invitationInclude,
      orderBy: { [query.sortBy]: query.sortOrder },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);

  return {
    invitations,
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
};

/** Shared loader for candidate-only invitation actions */
const getOwnPending = async (user: AuthUser, id: string) => {
  const invitation = await prisma.invitation.findFirst({
    where: { id },
    include: { assessment: true },
  });
  if (!invitation) throw ApiError.notFound('Invitation not found');
  if (invitation.candidateId !== user.id) {
    throw ApiError.forbidden('This invitation does not belong to you');
  }
  return invitation;
};

const accept = async (user: AuthUser, id: string) => {
  const invitation = await getOwnPending(user, id);

  if (invitation.status !== InvitationStatus.PENDING) {
    throw ApiError.conflict(`Invitation already responded (status: ${invitation.status})`);
  }
  if (invitation.expiresAt && invitation.expiresAt < new Date()) {
    await prisma.invitation.update({
      where: { id },
      data: { status: InvitationStatus.EXPIRED },
    });
    throw ApiError.conflict('Invitation has expired');
  }

  const updated = await prisma.invitation.update({
    where: { id },
    data: { status: InvitationStatus.ACCEPTED, respondedAt: new Date() },
    include: invitationInclude,
  });

  await audit({
    actorId: user.id,
    action: 'INVITATION_ACCEPTED',
    targetType: 'INVITATION',
    targetId: id,
  });
  return updated;
};

const reject = async (user: AuthUser, id: string) => {
  const invitation = await getOwnPending(user, id);

  if (invitation.status !== InvitationStatus.PENDING) {
    throw ApiError.conflict(`Invitation already responded (status: ${invitation.status})`);
  }

  const updated = await prisma.invitation.update({
    where: { id },
    data: { status: InvitationStatus.CANCELLED, respondedAt: new Date() },
    include: invitationInclude,
  });

  await audit({
    actorId: user.id,
    action: 'INVITATION_REJECTED',
    targetType: 'INVITATION',
    targetId: id,
  });
  return updated;
};

export const InvitationService = { send, list, accept, reject };
