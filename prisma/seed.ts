import { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const main = async () => {
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@assessment.com';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'Admin@1234';

  const hashed = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: Role.ADMIN, isDeleted: false, deletedAt: null },
    create: {
      name: 'Platform Admin',
      email: adminEmail,
      password: hashed,
      role: Role.ADMIN,
    },
  });

  // Demo recruiter
  const recruiterEmail = 'recruiter@assessment.com';
  const recruiter = await prisma.user.upsert({
    where: { email: recruiterEmail },
    update: {},
    create: {
      name: 'Demo Recruiter',
      email: recruiterEmail,
      password: await bcrypt.hash('Recruiter@1234', 10),
      role: Role.RECRUITER,
    },
  });

  // Demo candidate
  const candidateEmail = 'candidate@assessment.com';
  const candidate = await prisma.user.upsert({
    where: { email: candidateEmail },
    update: {},
    create: {
      name: 'Demo Candidate',
      email: candidateEmail,
      password: await bcrypt.hash('Candidate@1234', 10),
      role: Role.CANDIDATE,
    },
  });

  // Demo assessments + questions
  const freeAssessment = await prisma.assessment.upsert({
    where: { id: 'seed-free-js-assessment' },
    update: {},
    create: {
      id: 'seed-free-js-assessment',
      title: 'JavaScript Fundamentals (Free)',
      description: 'Core JavaScript concepts: closures, hoisting, event loop, and ES6 features.',
      price: 0,
      durationMin: 30,
      isPublished: true,
      recruiterId: recruiter.id,
      questions: {
        create: [
          {
            type: 'MCQ',
            prompt: 'What is the output of: console.log(typeof null)?',
            options: ['"null"', '"object"', '"undefined"', '"number"'],
            correctAnswer: '"object"',
            points: 1,
          },
          {
            type: 'MCQ',
            prompt: 'Which method creates a new array with elements that pass a test?',
            options: ['map()', 'filter()', 'forEach()', 'reduce()'],
            correctAnswer: 'filter()',
            points: 1,
          },
          {
            type: 'MCQ',
            prompt: 'A closure is a function that…',
            options: [
              'is defined inside a loop',
              'remembers its lexical scope',
              'cannot be reused',
              'runs asynchronously',
            ],
            correctAnswer: 'remembers its lexical scope',
            points: 2,
          },
        ],
      },
    },
  });

  const paidAssessment = await prisma.assessment.upsert({
    where: { id: 'seed-paid-system-design-assessment' },
    update: {},
    create: {
      id: 'seed-paid-system-design-assessment',
      title: 'System Design Assessment (Paid)',
      description: 'Intermediate system design and architecture questions for backend engineers.',
      price: 1999,
      durationMin: 45,
      isPublished: true,
      recruiterId: recruiter.id,
      questions: {
        create: [
          {
            type: 'MCQ',
            prompt: 'Which database is most suitable for complex relational queries?',
            options: ['MongoDB', 'Redis', 'PostgreSQL', 'DynamoDB'],
            correctAnswer: 'PostgreSQL',
            points: 2,
          },
          {
            type: 'MCQ',
            prompt: 'What does a message queue primarily provide?',
            options: [
              'Synchronous coupling',
              'Decoupled asynchronous processing',
              'Database replication',
              'SSL termination',
            ],
            correctAnswer: 'Decoupled asynchronous processing',
            points: 2,
          },
        ],
      },
    },
  });

  // eslint-disable-next-line no-console
  console.log('✅ Seed completed:');
  // eslint-disable-next-line no-console
  console.log(`   Admin:     ${admin.email} / ${adminPassword}`);
  // eslint-disable-next-line no-console
  console.log(`   Recruiter: ${recruiter.email} / Recruiter@1234`);
  // eslint-disable-next-line no-console
  console.log(`   Candidate: ${candidate.email} / Candidate@1234`);
  // eslint-disable-next-line no-console
  console.log(`   Assessments: ${freeAssessment.title}, ${paidAssessment.title}`);
};

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
