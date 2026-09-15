// One-off cleanup: removes smoke-test users (email ends with @test.com) and their audit logs.
// Usage: node scripts/cleanup-smoke.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: '@test.com' } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);

  const logs = await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  const removed = await prisma.user.deleteMany({ where: { id: { in: ids } } });

  console.log(`deleted ${removed.count} smoke users, ${logs.count} audit logs`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
