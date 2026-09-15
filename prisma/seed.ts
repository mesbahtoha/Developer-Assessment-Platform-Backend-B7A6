import {
  AssessmentStatus,
  AttemptStatus,
  Difficulty,
  EvaluationMethod,
  InvitationStatus,
  PrismaClient,
  ProblemType,
  Role,
  SubmissionStatus,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@assessment.com';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'Admin@1234';

  // ---------- Users ----------
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: Role.ADMIN, isDeleted: false, deletedAt: null },
    create: {
      name: 'Platform Admin',
      email: adminEmail,
      password: await bcrypt.hash(adminPassword, 10),
      role: Role.ADMIN,
    },
  });

  const recruiter = await prisma.user.upsert({
    where: { email: 'recruiter@assessment.com' },
    update: {},
    create: {
      name: 'Demo Recruiter',
      email: 'recruiter@assessment.com',
      password: await bcrypt.hash('Recruiter@1234', 10),
      role: Role.RECRUITER,
      recruiterProfile: {
        create: {
          companyName: 'TechCorp Solutions',
          companyWebsite: 'https://techcorp.example.com',
          designation: 'Engineering Manager',
        },
      },
    },
  });

  const candidate = await prisma.user.upsert({
    where: { email: 'candidate@assessment.com' },
    update: {},
    create: {
      name: 'Demo Candidate',
      email: 'candidate@assessment.com',
      password: await bcrypt.hash('Candidate@1234', 10),
      role: Role.CANDIDATE,
      candidateProfile: {
        create: {
          headline: 'Junior Backend Developer',
          skills: ['JavaScript', 'Node.js', 'PostgreSQL'],
          experienceYears: 1,
          githubUrl: 'https://github.com/demo-candidate',
        },
      },
    },
  });

  // Second candidate: owns the pre-evaluated demo attempt/result
  const evaluatedCandidate = await prisma.user.upsert({
    where: { email: 'jane.candidate@assessment.com' },
    update: {},
    create: {
      name: 'Jane Smith',
      email: 'jane.candidate@assessment.com',
      password: await bcrypt.hash('Jane@1234', 10),
      role: Role.CANDIDATE,
      candidateProfile: {
        create: {
          headline: 'Frontend Developer',
          skills: ['JavaScript', 'React'],
          experienceYears: 2,
        },
      },
    },
  });

  // ---------- Problem bank ----------
  const problemsData = [
    {
      id: 'seed-problem-1',
      title: 'typeof null',
      type: ProblemType.MCQ,
      difficulty: Difficulty.EASY,
      prompt: 'What is the output of: console.log(typeof null)?',
      options: ['"null"', '"object"', '"undefined"', '"number"'],
      correctAnswer: '"object"',
      points: 1,
      tags: ['javascript', 'types'],
    },
    {
      id: 'seed-problem-2',
      title: 'Array filtering',
      type: ProblemType.MCQ,
      difficulty: Difficulty.EASY,
      prompt: 'Which method creates a new array with elements that pass a test?',
      options: ['map()', 'filter()', 'forEach()', 'reduce()'],
      correctAnswer: 'filter()',
      points: 1,
      tags: ['javascript', 'arrays'],
    },
    {
      id: 'seed-problem-3',
      title: 'Closures',
      type: ProblemType.MCQ,
      difficulty: Difficulty.MEDIUM,
      prompt: 'A closure is a function that…',
      options: [
        'is defined inside a loop',
        'remembers its lexical scope',
        'cannot be reused',
        'runs asynchronously',
      ],
      correctAnswer: 'remembers its lexical scope',
      points: 2,
      tags: ['javascript', 'scope'],
    },
    {
      id: 'seed-problem-4',
      title: 'Relational databases',
      type: ProblemType.MCQ,
      difficulty: Difficulty.EASY,
      prompt: 'Which database is most suitable for complex relational queries?',
      options: ['MongoDB', 'Redis', 'PostgreSQL', 'DynamoDB'],
      correctAnswer: 'PostgreSQL',
      points: 2,
      tags: ['databases'],
    },
    {
      id: 'seed-problem-5',
      title: 'Message queues',
      type: ProblemType.MCQ,
      difficulty: Difficulty.MEDIUM,
      prompt: 'What does a message queue primarily provide?',
      options: [
        'Synchronous coupling',
        'Decoupled asynchronous processing',
        'Database replication',
        'SSL termination',
      ],
      correctAnswer: 'Decoupled asynchronous processing',
      points: 2,
      tags: ['architecture'],
    },
    {
      id: 'seed-problem-6',
      title: 'Debounce function',
      type: ProblemType.CODE,
      difficulty: Difficulty.HARD,
      prompt:
        'Write a debounce(callback, delay) function that delays invoking callback until delay ms have elapsed since the last call.',
      options: null,
      correctAnswer: 'Reference solution: a closure storing the timer id, cleared on each call.',
      points: 5,
      tags: ['javascript', 'timers'],
    },
  ];

  const problems: { id: string; correctAnswer: string; points: number }[] = [];
  for (const p of problemsData) {
    const problem = await prisma.problem.upsert({
      where: { id: p.id },
      update: {},
      create: {
        ...p,
        options: p.options as never,
        createdById: recruiter.id,
      },
    });
    problems.push({ id: problem.id, correctAnswer: p.correctAnswer, points: p.points });
  }

  // ---------- Assessments ----------
  const freeAssessment = await prisma.assessment.upsert({
    where: { id: 'seed-assessment-free-js' },
    update: {},
    create: {
      id: 'seed-assessment-free-js',
      title: 'JavaScript Fundamentals (Free)',
      description: 'Core JavaScript concepts: types, arrays, closures and timers.',
      status: AssessmentStatus.PUBLISHED,
      durationMin: 30,
      price: 0,
      passScorePercent: 50,
      recruiterId: recruiter.id,
    },
  });

  const paidAssessment = await prisma.assessment.upsert({
    where: { id: 'seed-assessment-paid-sysdesign' },
    update: {},
    create: {
      id: 'seed-assessment-paid-sysdesign',
      title: 'System Design Assessment (Paid)',
      description: 'Intermediate system design and architecture questions for backend engineers.',
      status: AssessmentStatus.PUBLISHED,
      durationMin: 45,
      price: 1999,
      passScorePercent: 60,
      recruiterId: recruiter.id,
    },
  });

  const draftAssessment = await prisma.assessment.upsert({
    where: { id: 'seed-assessment-draft-nodejs' },
    update: {},
    create: {
      id: 'seed-assessment-draft-nodejs',
      title: 'Node.js Advanced (Draft)',
      description: 'Draft assessment about Node.js internals — not visible to candidates yet.',
      status: AssessmentStatus.DRAFT,
      durationMin: 40,
      price: 0,
      recruiterId: recruiter.id,
    },
  });

  // Attach problems to assessments (ordered join table)
  const links = [
    { assessmentId: freeAssessment.id, problemId: problems[0].id, order: 1 },
    { assessmentId: freeAssessment.id, problemId: problems[1].id, order: 2 },
    { assessmentId: freeAssessment.id, problemId: problems[2].id, order: 3 },
    { assessmentId: paidAssessment.id, problemId: problems[3].id, order: 1 },
    { assessmentId: paidAssessment.id, problemId: problems[4].id, order: 2 },
    { assessmentId: paidAssessment.id, problemId: problems[5].id, order: 3 },
    { assessmentId: draftAssessment.id, problemId: problems[1].id, order: 1 },
  ];
  for (const link of links) {
    await prisma.assessmentProblem.upsert({
      where: {
        assessmentId_problemId: {
          assessmentId: link.assessmentId,
          problemId: link.problemId,
        },
      },
      update: { order: link.order },
      create: link,
    });
  }

  // ---------- Invitation (demo workflow data) ----------
  const invitation = await prisma.invitation.upsert({
    where: {
      assessmentId_candidateId: {
        assessmentId: paidAssessment.id,
        candidateId: candidate.id,
      },
    },
    update: {},
    create: {
      assessmentId: paidAssessment.id,
      candidateId: candidate.id,
      invitedById: recruiter.id,
      status: InvitationStatus.PENDING,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  // ---------- Pre-evaluated demo attempt (Jane on free assessment) ----------
  const attempt = await prisma.attempt.upsert({
    where: {
      candidateId_assessmentId: {
        candidateId: evaluatedCandidate.id,
        assessmentId: freeAssessment.id,
      },
    },
    update: {},
    create: {
      candidateId: evaluatedCandidate.id,
      assessmentId: freeAssessment.id,
      status: AttemptStatus.EVALUATED,
      startedAt: new Date(Date.now() - 60 * 60 * 1000),
      submittedAt: new Date(Date.now() - 30 * 60 * 1000),
    },
  });

  // Jane answers problems 1 and 2 correctly, 3 wrongly
  const answers: Record<string, string> = {
    [problems[0].id]: problems[0].correctAnswer,
    [problems[1].id]: problems[1].correctAnswer,
    [problems[2].id]: 'is defined inside a loop',
  };

  let score = 0;
  let total = 0;
  for (const link of links.filter((l) => l.assessmentId === freeAssessment.id)) {
    const problem = problems.find((p) => p.id === link.problemId);
    if (!problem) continue;
    const answer = answers[problem.id] ?? null;
    const isCorrect = answer === problem.correctAnswer;
    const awarded = isCorrect ? problem.points : 0;
    total += problem.points;
    score += awarded;

    const submission = await prisma.submission.upsert({
      where: { attemptId_problemId: { attemptId: attempt.id, problemId: problem.id } },
      update: {},
      create: {
        attemptId: attempt.id,
        problemId: problem.id,
        answer,
        status: SubmissionStatus.EVALUATED,
        pointsAwarded: awarded,
        evaluatedAt: new Date(),
      },
    });

    await prisma.evaluation.upsert({
      where: { submissionId: submission.id },
      update: {},
      create: {
        submissionId: submission.id,
        method: EvaluationMethod.AUTO,
        score: awarded,
        maxScore: problem.points,
        feedback: isCorrect ? 'Correct answer' : 'Incorrect answer',
      },
    });
  }

  await prisma.result.upsert({
    where: { attemptId: attempt.id },
    update: {},
    create: {
      attemptId: attempt.id,
      score,
      totalPoints: total,
      percentage: total === 0 ? 0 : Math.round((score / total) * 10000) / 100,
      isPassed: score >= (total * 50) / 100,
      publishedAt: new Date(),
    },
  });

  // eslint-disable-next-line no-console
  console.log('✅ Seed completed:');
  // eslint-disable-next-line no-console
  console.log(`   Admin:      ${admin.email} / ${adminPassword}`);
  // eslint-disable-next-line no-console
  console.log(`   Recruiter:  ${recruiter.email} / Recruiter@1234`);
  // eslint-disable-next-line no-console
  console.log(`   Candidate:  ${candidate.email} / Candidate@1234`);
  // eslint-disable-next-line no-console
  console.log(`   Candidate2: ${evaluatedCandidate.email} / Jane@1234 (has evaluated result)`);
  // eslint-disable-next-line no-console
  console.log(
    `   Assessments: ${freeAssessment.title}, ${paidAssessment.title}, ${draftAssessment.title}`
  );
  // eslint-disable-next-line no-console
  console.log(`   Invitation: ${candidate.email} -> "${paidAssessment.title}" (${invitation.status})`);
  // eslint-disable-next-line no-console
  console.log(`   Demo result: ${score}/${total} points on "${freeAssessment.title}"`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
