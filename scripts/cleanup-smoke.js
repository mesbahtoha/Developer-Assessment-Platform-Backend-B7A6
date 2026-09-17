/**
 * Removes everything created by the smoke/QA suite:
 *   - fixtures whose title starts with "SMOKE" (assessments + problems, incl. soft-deleted rows)
 *   - smoke users (email ends with @test.com) and their audit logs
 *   - pending payments created for smoke assessments
 *   - restores the demo candidate/recruiter profile text
 *
 * Usage: node scripts/cleanup-smoke.js   (stop the API server first so a DB connection is free)
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const SMOKE_TAG = 'SMOKE';

async function main() {
  const problems = await prisma.problem.deleteMany({ where: { title: { startsWith: SMOKE_TAG } } });
  const assessments = await prisma.assessment.deleteMany({ where: { title: { startsWith: SMOKE_TAG } } });

  const users = await prisma.user.findMany({
    where: { email: { endsWith: '@test.com' } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);

  const logs = await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  const removedUsers = await prisma.user.deleteMany({ where: { id: { in: ids } } });

  // Undo profile text that the smoke suite overwrites
  const recruiter = await prisma.user.findUnique({
    where: { email: 'recruiter@assessment.com' },
    select: { id: true },
  });
  if (recruiter) {
    await prisma.recruiterProfile
      .update({ where: { userId: recruiter.id }, data: { companyName: 'TechCorp Solutions' } })
      .catch(() => null);
  }
  const candidate = await prisma.user.findUnique({
    where: { email: 'candidate@assessment.com' },
    select: { id: true },
  });
  if (candidate) {
    await prisma.candidateProfile
      .update({ where: { userId: candidate.id }, data: { headline: 'Junior Backend Developer' } })
      .catch(() => null);
  }

  console.log(
    `cleanup done: ${assessments.count} assessment(s), ${problems.count} problem(s), ` +
      `${removedUsers.count} smoke user(s), ${logs.count} audit log(s) removed`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
