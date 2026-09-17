/**
 * End-to-end API smoke test (no test framework required).
 *
 * Usage:
 *   npm run build && npm start          # terminal 1 (or point at the deployed URL)
 *   node scripts/smoke.js               # terminal 2  (defaults to http://localhost:5000/api/v1)
 *   node scripts/smoke.js https://your-deployment.vercel.app/api/v1
 *   SMOKE_BASE_URL=https://... node scripts/smoke.js
 *
 * Verifies, against a real database: response envelope, auth + refresh, RBAC (403),
 * validation errors (400), 404s, soft delete, pagination/filter/sort/search,
 * assessment lifecycle, invitations, attempt history, the Results module
 * (list, detail, ownership, publish lifecycle, leaderboard), Redis cache
 * behaviour and the Stripe payment flow (amount-tampering rejection +
 * checkout session creation).
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

let rateLimitCleanup;
async function clearRateLimits() {
  if (!process.env.REDIS_URL) return;
  try {
    const Redis = require('ioredis');
    const redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 5000 });
    await redis.connect();
    let cursor = '0';
    let removed = 0;
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', 'b7a6:rl:*', 'COUNT', 200);
      cursor = next;
      if (keys.length > 0) removed += await redis.unlink(...keys);
    } while (cursor !== '0');
    await redis.quit();
    console.log(`rate-limit keys cleared: ${removed}`);
  } catch (err) {
    console.log(`rate-limit cleanup skipped: ${err.message}`);
  }
}
rateLimitCleanup = clearRateLimits();


const BASE = (
  process.argv[2] ||
  process.env.SMOKE_BASE_URL ||
  'http://localhost:5000/api/v1'
).replace(/\/$/, '');

const CREDENTIALS = {
  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@assessment.com',
    password: process.env.ADMIN_PASSWORD || 'Admin@1234',
  },
  recruiter: {
    email: process.env.SMOKE_RECRUITER_EMAIL || 'recruiter@assessment.com',
    password: process.env.SMOKE_RECRUITER_PASSWORD || 'Recruiter@1234',
  },
  candidate: {
    email: process.env.SMOKE_CANDIDATE_EMAIL || 'candidate@assessment.com',
    password: process.env.SMOKE_CANDIDATE_PASSWORD || 'Candidate@1234',
  },
};

const SMOKE_TAG = 'SMOKE';
const results = [];

function record(status, name, detail = '') {
  results.push({ status, name, detail });
  const icon = status === 'PASS' ? 'PASS' : status === 'WARN' ? 'WARN' : 'FAIL';
  console.log(`${icon}  ${name}${detail ? `  -> ${detail}` : ''}`);
}

function check(name, condition, detail = '') {
  record(condition ? 'PASS' : 'FAIL', name, detail);
  return Boolean(condition);
}

function warn(name, detail = '') {
  record('WARN', name, detail);
}

async function api(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      // Hard timeout so a hung network call (e.g. a slow Stripe API) can never
      // stall the whole suite silently.
      signal: AbortSignal.timeout(30000),
    });

    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: res.status, json, text };
  } catch (err) {
    // Network/timeout failure surfaces as a structured "failed" response so
    // the affected check records FAIL instead of crashing the suite.
    return { status: 0, json: null, text: String(err?.message || err) };
  }
}

const okEnvelope = (json) =>
  Boolean(json) && json.success === true && typeof json.message === 'string' && 'data' in json;
const errEnvelope = (json) =>
  Boolean(json) &&
  json.success === false &&
  typeof json.message === 'string' &&
  Array.isArray(json.errors);
async function main() {
  console.log('\n=== Developer Assessment Platform API smoke test ===');
  console.log(`Base URL: ${BASE}\n`);
  await rateLimitCleanup;

  // ---------- 0. Health + API index ----------
  const health = await api('GET', '/health');
  check(
    'health endpoint responds in the standard envelope',
    health.status === 200 && okEnvelope(health.json),
    `status=${health.status}`
  );
  console.log(
    `     database=${health.json?.data?.database?.status} cache=${health.json?.data?.cache?.status} stats=${JSON.stringify(
      health.json?.data?.cache?.stats
    )}`
  );

  const index = await api('GET', '');
  check(
    'API index documents all modules',
    index.status === 200 && okEnvelope(index.json) && Boolean(index.json.data.modules)
  );

  // ---------- 1. Authentication ----------
  const tokens = {};
  for (const role of ['admin', 'recruiter', 'candidate']) {
    const res = await api('POST', '/auth/login', { body: CREDENTIALS[role] });
    tokens[role] = res.json?.data?.accessToken;
    check(
      `login as ${role} returns access + refresh tokens`,
      res.status === 200 &&
        okEnvelope(res.json) &&
        Boolean(tokens[role]) &&
        typeof res.json.data.refreshToken === 'string',
      `status=${res.status}`
    );
  }

  const me = await api('GET', '/auth/me', { token: tokens.candidate });
  check('GET /auth/me works with a Bearer token', me.status === 200 && me.json?.data?.user?.role === 'CANDIDATE');

  const noToken = await api('GET', '/users/me');
  check('protected route without token -> 401', noToken.status === 401 && errEnvelope(noToken.json), `status=${noToken.status}`);

  const badToken = await api('GET', '/users/me', { token: 'not-a-real-token' });
  check('invalid token -> 401 structured error', badToken.status === 401 && errEnvelope(badToken.json));

  // ---------- 2. Refresh rotation + logout ----------
  const loginAdmin = await api('POST', '/auth/login', { body: CREDENTIALS.admin });
  const refreshToken = loginAdmin.json?.data?.refreshToken;
  const refreshed = await api('POST', '/auth/refresh-token', { body: { refreshToken } });
  check('refresh-token rotates the session', refreshed.status === 200 && Boolean(refreshed.json?.data?.accessToken));
  const reuse = await api('POST', '/auth/refresh-token', { body: { refreshToken } });
  check(
    'rotated (revoked) refresh token cannot be reused',
    reuse.status === 401 && errEnvelope(reuse.json),
    `status=${reuse.status}`
  );
  const logout = await api('POST', '/auth/logout', {
    body: { refreshToken: refreshed.json?.data?.refreshToken ?? '' },
  });
  check('logout revokes the refresh token', logout.status === 200 && okEnvelope(logout.json));

  // ---------- 3. Validation + error handling ----------
  const badEmail = await api('POST', '/auth/register', {
    body: { name: 'Bad Email', email: 'not-an-email', password: 'WeakPass1' },
  });
  check(
    'invalid email -> 400 with field-level errors[]',
    badEmail.status === 400 && errEnvelope(badEmail.json) && badEmail.json.errors.length > 0,
    JSON.stringify(badEmail.json?.errors?.[0] ?? {})
  );

  const weakPassword = await api('POST', '/auth/register', {
    body: { name: 'Short Pass', email: `smoke.short.${Date.now()}@test.com`, password: 'abc' },
  });
  check('weak password -> 400 validation error', weakPassword.status === 400 && errEnvelope(weakPassword.json));

  const notFound = await api('GET', '/problems/11111111-1111-1111-1111-111111111111', { token: tokens.recruiter });
  check('unknown resource -> 404 not found', notFound.status === 404 && errEnvelope(notFound.json), `status=${notFound.status}`);

  const unknownRoute = await api('GET', '/definitely-not-a-route');
  check('unknown route -> 404 structured response', unknownRoute.status === 404 && errEnvelope(unknownRoute.json));

  const badUuid = await api('GET', '/attempts/not-a-uuid', { token: tokens.candidate });
  check(
    'invalid/unknown attempt id -> structured 400 or 404',
    [400, 404].includes(badUuid.status) && errEnvelope(badUuid.json),
    `status=${badUuid.status}`
  );

  // ---------- 4. RBAC (3 roles) ----------
  const recruiterOnAdmin = await api('GET', '/admin/users', { token: tokens.recruiter });
  check('RECRUITER on /admin/users -> 403 forbidden', recruiterOnAdmin.status === 403 && errEnvelope(recruiterOnAdmin.json));
  const candidateOnStats = await api('GET', '/admin/dashboard-stats', { token: tokens.candidate });
  check('CANDIDATE on /admin/dashboard-stats -> 403 forbidden', candidateOnStats.status === 403 && errEnvelope(candidateOnStats.json));
  const candidateOnProblems = await api('GET', '/problems', { token: tokens.candidate });
  check('CANDIDATE on /problems -> 403 forbidden', candidateOnProblems.status === 403 && errEnvelope(candidateOnProblems.json));
  const adminOnUsers = await api('GET', '/admin/users?page=1&limit=2', { token: tokens.admin });
  check('ADMIN on /admin/users -> 200 with pagination meta', adminOnUsers.status === 200 && adminOnUsers.json?.data?.meta?.limit === 2);
  const recruiterStart = await api('POST', '/assessments/11111111-1111-1111-1111-111111111111/start', { token: tokens.recruiter });
  check('RECRUITER cannot start a candidate attempt -> 403', recruiterStart.status === 403 && errEnvelope(recruiterStart.json));

  // ---------- 5. Candidate / recruiter profiles ----------
  const candidateProfile = await api('PATCH', '/users/me/profile', {
    token: tokens.candidate,
    body: {
      headline: `${SMOKE_TAG} Backend Developer`,
      skills: ['Node.js', 'PostgreSQL'],
      experienceYears: 2,
    },
  });
  check(
    'candidate updates the developer profile',
    candidateProfile.status === 200 && String(candidateProfile.json?.data?.profile?.headline).startsWith(SMOKE_TAG)
  );
  const candidateCompanyField = await api('PATCH', '/users/me/profile', {
    token: tokens.candidate,
    body: { companyName: 'Not Allowed Ltd' },
  });
  check(
    'candidate cannot set recruiter-only company fields -> 400',
    candidateCompanyField.status === 400 && errEnvelope(candidateCompanyField.json)
  );
  const recruiterProfile = await api('PATCH', '/users/me/profile', {
    token: tokens.recruiter,
    body: {
      companyName: `${SMOKE_TAG} TechCorp`,
      companyWebsite: 'https://smoke.example.com',
      designation: 'Engineering Manager',
    },
  });
  check(
    'recruiter updates the company profile',
    recruiterProfile.status === 200 && String(recruiterProfile.json?.data?.profile?.companyName).startsWith(SMOKE_TAG)
  );
  const adminProfile = await api('GET', '/users/me/profile', { token: tokens.admin });
  check(
    'admin profile endpoint answers with a note (no candidate/company profile)',
    adminProfile.status === 200 && adminProfile.json?.data?.profile === null
  );

  // ---------- 6. Problem bank: CRUD, validation, search, filter, sort ----------
  const createProblem = await api('POST', '/problems', {
    token: tokens.recruiter,
    body: {
      title: `${SMOKE_TAG} HTTP status codes`,
      type: 'MCQ',
      difficulty: 'EASY',
      prompt: `${SMOKE_TAG}: Which HTTP status code means "Created"?`,
      options: ['200', '201', '204', '400'],
      correctAnswer: '201',
      points: 2,
      tags: ['http', 'smoke'],
    },
  });
  const problemId = createProblem.json?.data?.problem?.id;
  check('recruiter creates an MCQ problem (201)', createProblem.status === 201 && Boolean(problemId), `status=${createProblem.status}`);

  const mcqConsistency = await api('POST', '/problems', {
    token: tokens.recruiter,
    body: {
      title: `${SMOKE_TAG} invalid mcq`,
      type: 'MCQ',
      prompt: 'correctAnswer is not among the options',
      options: ['a', 'b'],
      correctAnswer: 'not-an-option',
    },
  });
  check('MCQ correctAnswer must match one of the options -> 400', mcqConsistency.status === 400 && errEnvelope(mcqConsistency.json));

  const listProblems = await api('GET', '/problems?page=1&limit=5&type=MCQ&sortBy=title&sortOrder=asc', {
    token: tokens.recruiter,
  });
  check(
    'problem list supports pagination + filtering + sorting',
    listProblems.status === 200 && listProblems.json?.data?.meta?.limit === 5 && Array.isArray(listProblems.json?.data?.problems)
  );

  const searchProblems = await api('GET', `/problems/search?q=${SMOKE_TAG}&limit=5`, { token: tokens.recruiter });
  check('problem search matches the smoke title', searchProblems.status === 200 && searchProblems.json?.data?.count >= 1);

  // ---------- 7. Assessment lifecycle (DRAFT -> PUBLISHED) ----------
  const price = 2500;
  const createAssessment = await api('POST', '/assessments', {
    token: tokens.recruiter,
    body: {
      title: `${SMOKE_TAG} Assessment ${Date.now()}`,
      description: `${SMOKE_TAG} end-to-end assessment used by scripts/smoke.js`,
      durationMin: 30,
      price,
      passScorePercent: 50,
    },
  });
  const assessmentId = createAssessment.json?.data?.assessment?.id;
  check('recruiter creates an assessment in DRAFT', createAssessment.status === 201 && Boolean(assessmentId), `status=${createAssessment.status}`);

  const publishEmpty = await api('PATCH', `/assessments/${assessmentId}`, {
    token: tokens.recruiter,
    body: { status: 'PUBLISHED' },
  });
  check(
    'cannot publish an assessment without problems -> 400',
    publishEmpty.status === 400 && errEnvelope(publishEmpty.json),
    publishEmpty.json?.message
  );

  const attach = await api('POST', `/assessments/${assessmentId}/problems`, {
    token: tokens.recruiter,
    body: { problemIds: [problemId] },
  });
  check('recruiter attaches a problem to the assessment', attach.status === 200 && attach.json?.data?.problems?.length === 1);

  const publish = await api('PATCH', `/assessments/${assessmentId}`, {
    token: tokens.recruiter,
    body: { status: 'PUBLISHED' },
  });
  check(
    'DRAFT -> PUBLISHED status transition works',
    publish.status === 200 && publish.json?.data?.assessment?.status === 'PUBLISHED',
    `status=${publish.status} body=${publish.json?.message}`
  );

  const recruiterList = await api('GET', '/assessments?page=1&limit=5&status=PUBLISHED&sortBy=createdAt&sortOrder=desc', {
    token: tokens.recruiter,
  });
  check('assessment list supports pagination + status filter + sort', recruiterList.status === 200 && recruiterList.json?.data?.meta?.limit === 5);

  const candidateList = await api('GET', `/assessments?search=${SMOKE_TAG}`, { token: tokens.candidate });
  check(
    'candidate sees the published smoke assessment in the listing',
    candidateList.status === 200 && candidateList.json?.data?.assessments?.some((a) => a.id === assessmentId)
  );

  const candidateDetail = await api('GET', `/assessments/${assessmentId}`, { token: tokens.candidate });
  const leaked = JSON.stringify(candidateDetail.json?.data ?? {}).includes('"correctAnswer"');
  check('candidate assessment detail never leaks correctAnswer', candidateDetail.status === 200 && !leaked, `leaked=${leaked}`);

  // ---------- 8. Stripe payment flow (anti-tampering + checkout) ----------
  const tampered = await api('POST', '/payments/create', {
    token: tokens.candidate,
    // 100 cents is a valid amount on its own, but it does NOT match the stored price (2500)
    body: { assessmentId, amountInCents: 100 },
  });
  check(
    'amount tampering is rejected -> 400 (server-side price enforcement)',
    tampered.status === 400 && errEnvelope(tampered.json),
    tampered.json?.message
  );

  const tooSmall = await api('POST', '/payments/create', {
    token: tokens.candidate,
    body: { assessmentId, amountInCents: 1 },
  });
  check('amount below the Stripe minimum -> 400 validation error', tooSmall.status === 400 && errEnvelope(tooSmall.json));

  const checkout = await api('POST', '/payments/create', {
    token: tokens.candidate,
    body: { assessmentId, amountInCents: price },
  });
  let paymentId = checkout.json?.data?.payment?.id;
  let checkoutUrl = checkout.json?.data?.url;
  const checkoutOk = (checkout.status === 201 || checkout.status === 200) && Boolean(paymentId);
  if (checkoutOk) {
    check('Stripe checkout session created and stored as PENDING payment', Boolean(checkoutUrl), `reused=${checkout.json?.data?.reused}`);
    const reused = await api('POST', '/payments/create', { token: tokens.candidate, body: { assessmentId } });
    check(
      're-requesting checkout reuses the open session (no duplicate charge)',
      (reused.status === 200 || reused.status === 201) && reused.json?.data?.reused === true
    );
    const myPayments = await api('GET', '/payments/my-payments?page=1&limit=5&status=PENDING', { token: tokens.candidate });
    check('payment history is paginated + status filtered', myPayments.status === 200 && myPayments.json?.data?.meta?.limit === 5);
    const paymentDetail = await api('GET', `/payments/${paymentId}`, { token: tokens.candidate });
    check('candidate can read their own payment', paymentDetail.status === 200 && paymentDetail.json?.data?.payment?.amount === price);
    const otherCandidatePayment = await api('GET', `/payments/${paymentId}`, { token: tokens.recruiter });
    check('another user cannot read a foreign payment -> 403', otherCandidatePayment.status === 403);
  } else {
    warn('Stripe checkout session skipped (Stripe keys missing/not activated)', checkout.json?.message || `status=${checkout.status}`);
    const tamperedOnly = await api('POST', '/payments/create', { token: tokens.candidate, body: {} });
    check('checkout without assessmentId -> 400 validation error', tamperedOnly.status === 400 && errEnvelope(tamperedOnly.json));
  }

  // ---------- 9. Invitation workflow + attempt guards ----------
  const invite = await api('POST', '/invitations', {
    token: tokens.recruiter,
    body: { assessmentId, candidateEmail: CREDENTIALS.candidate.email },
  });
  const invitationId = invite.json?.data?.invitation?.id;
  check('recruiter invites a candidate', invite.status === 201 && Boolean(invitationId), invite.json?.message);

  const startBeforeAccept = await api('POST', `/assessments/${assessmentId}/start`, { token: tokens.candidate });
  check(
    'candidate cannot start before accepting the invitation -> 409',
    startBeforeAccept.status === 409 && errEnvelope(startBeforeAccept.json),
    startBeforeAccept.json?.message
  );

  const accept = await api('PATCH', `/invitations/${invitationId}/accept`, { token: tokens.candidate });
  check('candidate accepts the invitation', accept.status === 200 && accept.json?.data?.invitation?.status === 'ACCEPTED');

  const startWithoutPayment = await api('POST', `/assessments/${assessmentId}/start`, { token: tokens.candidate });
  check(
    'paid assessment blocks the attempt until payment succeeds -> 402',
    startWithoutPayment.status === 402 && errEnvelope(startWithoutPayment.json),
    startWithoutPayment.json?.message
  );

  const history = await api('GET', '/attempts/my-attempts?page=1&limit=5', { token: tokens.candidate });
  check('candidate attempt history is paginated', history.status === 200 && history.json?.data?.meta?.limit === 5);

  const recruiterOnHistory = await api('GET', '/attempts/my-attempts', { token: tokens.recruiter });
  check('RECRUITER cannot read candidate attempt history -> 403', recruiterOnHistory.status === 403);

  const pendingEvaluation = await api('GET', '/evaluation/submissions/pending?page=1&limit=5', { token: tokens.recruiter });
  check('recruiter pending-evaluation queue responds', pendingEvaluation.status === 200 && pendingEvaluation.json?.data?.meta?.limit === 5);

  // ---------- 10. Redis cache on the assessment report ----------
  const reportFirst = await api('GET', `/evaluation/assessments/${assessmentId}/report`, { token: tokens.recruiter });
  const reportSecond = await api('GET', `/evaluation/assessments/${assessmentId}/report`, { token: tokens.recruiter });
  check(
    'assessment report aggregation works (attempt funnel + results)',
    reportFirst.status === 200 &&
      Boolean(reportFirst.json?.data?.report?.attempts) &&
      Boolean(reportFirst.json?.data?.report?.results),
    reportFirst.json?.message
  );
  check('report responses are identical on cache hit', JSON.stringify(reportFirst.json?.data) === JSON.stringify(reportSecond.json?.data));
  const healthAfter = await api('GET', '/health');
  const cacheState = healthAfter.json?.data?.cache ?? {};
  if (cacheState.status === 'ready' || cacheState.status === 'idle') {
    check('Redis cache serves repeated reads (hits > 0)', (cacheState.stats?.hits ?? 0) > 0, JSON.stringify(cacheState.stats));
  } else {
    warn(`cache status = ${cacheState.status} (cache disabled/unreachable; API still correct)`);
  }

  // ---------- 10b. Results module (list, detail, lifecycle, leaderboard) ----------
  // Free the auth limiter so additional role logins below are not throttled
  // when the suite is run repeatedly inside the same rate-limit window.
  await clearRateLimits();
  const myResultsRes = await api('GET', '/results/me?page=1&limit=10&sortBy=createdAt&sortOrder=desc', { token: tokens.candidate });
  check(
    'candidate results list is paginated + enriched',
    myResultsRes.status === 200 &&
      okEnvelope(myResultsRes.json) &&
      Array.isArray(myResultsRes.json?.data?.results) &&
      myResultsRes.json?.data?.meta?.limit === 10,
    `status=${myResultsRes.status}`
  );
  // Fresh databases may have no results for the demo candidate yet, so fall
  // back to the seeded candidate (Jane), whose seed guarantees an evaluated,
  // published result. Detail checks run with whichever owner actually has rows.
  const publishedSeeds = (myResultsRes.json?.data?.results ?? []).filter((r) => r.isPublished === true);
  const candidateSource = publishedSeeds[0] ?? myResultsRes.json?.data?.results?.[0];

  const janeLoginEarly = await api('POST', '/auth/login', {
    body: { email: 'jane.candidate@assessment.com', password: 'Jane@1234' },
  });
  const janeToken = janeLoginEarly.json?.data?.accessToken;

  let detailSource = candidateSource ?? null;
  let ownerToken = tokens.candidate;
  if (!detailSource && janeToken) {
    const janeListEarly = await api('GET', '/results/me?page=1&limit=10', { token: janeToken });
    const janeSource = (janeListEarly.json?.data?.results ?? [])[0];
    if (janeSource) {
      detailSource = janeSource;
      ownerToken = janeToken;
    }
  }
  check(
    'seeded result rows exist for detail/lifecycle checks (demo or seeded candidate)',
    Boolean(detailSource),
    `candidateTotal=${myResultsRes.json?.data?.meta?.total}`
  );

  if (detailSource) {
    const detail = await api('GET', `/results/${detailSource.id}`, { token: ownerToken });
    check(
      'candidate reads own result detail with per-problem breakdown',
      detail.status === 200 && Array.isArray(detail.json?.data?.breakdown) && detail.json?.data?.breakdown?.length > 0,
      `breakdown=${detail.json?.data?.breakdown?.length}`
    );

    const noAnswersLeak = !JSON.stringify(detail.json?.data ?? {}).includes('"correctAnswer"');
    check('result detail never leaks problem answer keys', noAnswersLeak);

    // Ownership + publish lifecycle with the second seeded candidate (Jane).
    // Her seed guarantees a fully EVALUATED attempt with a published result.
    if (janeToken) {
      // No existence leak: the OTHER candidate gets 404 on this result
      const otherToken = ownerToken === tokens.candidate ? janeToken : tokens.candidate;
      const foreignRead = await api('GET', `/results/${detailSource.id}`, { token: otherToken });
      check('another candidate reading a foreign result -> 404', foreignRead.status === 404, `status=${foreignRead.status}`);

      const otherList = await api('GET', '/results/me?page=1&limit=10', { token: otherToken });
      check(
        'second candidate sees only their own results (isolation)',
        otherList.status === 200 &&
          !(otherList.json?.data?.results ?? []).some((r) => r.id === detailSource.id),
        `total=${otherList.json?.data?.meta?.total}`
      );

      // Pick a published result owned by Jane for the lifecycle checks
      let janePublished = null;
      if (ownerToken === janeToken) {
        janePublished = detailSource.isPublished ? detailSource : null;
      } else {
        const janeListNow = await api('GET', '/results/me?page=1&limit=10', { token: janeToken });
        janePublished = (janeListNow.json?.data?.results ?? []).find((r) => r.isPublished === true);
      }
      const janeResult = janePublished;
      if (janeResult) {
        const publishFirst = await api('PATCH', `/results/${janeResult.id}/publish`, { token: tokens.recruiter });
        check(
          'publishing an already-published result is idempotent (200)',
          publishFirst.status === 200 && publishFirst.json?.data?.result?.isPublished === true,
          `status=${publishFirst.status} msg=${publishFirst.json?.message}`
        );
        const unpublishRes = await api('PATCH', `/results/${janeResult.id}/unpublish`, { token: tokens.recruiter });
        check(
          'recruiter unpublishes (retracts) a published result',
          unpublishRes.status === 200 && unpublishRes.json?.data?.result?.isPublished === false
        );
        const publishRestore = await api('PATCH', `/results/${janeResult.id}/publish`, { token: tokens.recruiter });
        check(
          're-publishing restores the result (lifecycle round-trip)',
          publishRestore.status === 200 && publishRestore.json?.data?.result?.isPublished === true,
          `status=${publishRestore.status}`
        );
        const janePublish = await api('PATCH', `/results/${janeResult.id}/publish`, { token: janeToken });
        check('candidate cannot publish even their own result -> 403', janePublish.status === 403, `status=${janePublish.status}`);
      } else {
        warn('publish lifecycle skipped (no published result found for the seeded candidate)');
      }
    } else {
      warn('results ownership checks skipped (second candidate login failed)');
    }

    // Publish guards against the result owner (role guard applies to every candidate)
    const candidatePublish = await api('PATCH', `/results/${detailSource.id}/publish`, { token: ownerToken });
    check('candidate cannot publish a result -> 403', candidatePublish.status === 403, `status=${candidatePublish.status}`);

    // Summary + assessment results + leaderboard
    const summaryRes = await api('GET', '/results/me/summary', { token: ownerToken });
    check(
      'candidate results summary returns aggregates',
      summaryRes.status === 200 &&
        typeof summaryRes.json?.data?.total === 'number' &&
        typeof summaryRes.json?.data?.averagePercentage === 'number',
      JSON.stringify(summaryRes.json?.data)
    );
    const summaryAgain = await api('GET', '/results/me/summary', { token: ownerToken });
    check('results summary served consistently (cache-aware)', JSON.stringify(summaryRes.json?.data) === JSON.stringify(summaryAgain.json?.data));

    const assessmentResultsRes = await api('GET', `/results/assessment/${assessmentId}?page=1&limit=10&sortBy=percentage`, { token: tokens.recruiter });
    check(
      'recruiter assessment results list is paginated',
      assessmentResultsRes.status === 200 && Array.isArray(assessmentResultsRes.json?.data?.results),
      `status=${assessmentResultsRes.status}`
    );
    const searchRes = await api('GET', `/results/assessment/${assessmentId}?search=${encodeURIComponent(CREDENTIALS.candidate.email || 'smoke')}`, { token: tokens.recruiter });
    check('assessment results support candidate search', searchRes.status === 200);
    const foreignResults = await api('GET', `/results/assessment/${assessmentId}`, { token: ownerToken });
    check('candidate cannot list another candidate assessment results -> 403', foreignResults.status === 403, `status=${foreignResults.status}`);

    const leaderboardRes = await api('GET', `/results/assessment/${assessmentId}/leaderboard?limit=5`, { token: tokens.recruiter });
    const lb = leaderboardRes.json?.data?.leaderboard ?? [];
    const rankedDescending = lb.every((row, i) => i === 0 || (lb[i - 1].percentage ?? 0) >= (row.percentage ?? 0));
    check(
      'assessment leaderboard returns ranked rows',
      leaderboardRes.status === 200 && Array.isArray(lb) && lb.every((row, i) => row.rank === i + 1) && rankedDescending,
      `rows=${lb.length}`
    );
    const leaderboardAgain = await api('GET', `/results/assessment/${assessmentId}/leaderboard?limit=5`, { token: tokens.recruiter });
    check('leaderboard is served from cache (identical payload)', JSON.stringify(leaderboardRes.json?.data) === JSON.stringify(leaderboardAgain.json?.data));

    // Validation guards
    const badLeaderboard = await api('GET', `/results/assessment/${assessmentId}/leaderboard?limit=nope`, { token: tokens.recruiter });
    check('leaderboard invalid limit -> 400 validation error', badLeaderboard.status === 400 && errEnvelope(badLeaderboard.json));
    const badResultId = await api('GET', '/results/not-a-uuid', { token: ownerToken });
    check('invalid result id -> 400 validation error', badResultId.status === 400 && errEnvelope(badResultId.json));
    const missingResult = await api('GET', '/results/11111111-1111-1111-1111-111111111111', { token: ownerToken });
    check('unknown result id -> 404', missingResult.status === 404, `status=${missingResult.status}`);


  } else {
    warn('results detail/lifecycle checks skipped (no result rows visible)');
  }

  // ---------- 11. Admin operations ----------
  const adminStats = await api('GET', '/admin/dashboard-stats', { token: tokens.admin });
  check(
    'admin dashboard stats return grouped counters',
    adminStats.status === 200 && Boolean(adminStats.json?.data?.users) && Boolean(adminStats.json?.data?.payments)
  );
  const adminPayments = await api('GET', '/admin/payments?page=1&limit=5&status=PENDING&sortBy=amount&sortOrder=desc', {
    token: tokens.admin,
  });
  check('admin payment register is filtered + paginated', adminPayments.status === 200 && adminPayments.json?.data?.meta?.limit === 5);
  check('admin payment list never serializes password hashes', !JSON.stringify(adminPayments.json?.data ?? {}).includes('"password"'));
  const adminAssessments = await api('GET', `/admin/assessments?page=1&limit=5&search=${SMOKE_TAG}`, { token: tokens.admin });
  check('admin assessment register supports search', adminAssessments.status === 200 && Array.isArray(adminAssessments.json?.data?.assessments));
  const auditLogs = await api('GET', '/admin/audit-logs?page=1&limit=5&action=ASSESSMENT_CREATED', { token: tokens.admin });
  check('audit logs capture critical actions', auditLogs.status === 200 && auditLogs.json?.data?.logs?.length >= 1);
  const auditByTarget = await api('GET', '/admin/audit-logs?page=1&limit=3&targetType=USER', { token: tokens.admin });
  check('audit log filter by targetType works', auditByTarget.status === 200);
  const badRole = await api('PATCH', '/admin/users/11111111-1111-1111-1111-111111111111/role', {
    token: tokens.admin,
    body: { role: 'SUPERUSER' },
  });
  check('invalid enum payload -> 400 validation error', badRole.status === 400 && errEnvelope(badRole.json));

  // ---------- 11b. Assessment lifecycle terminal state ----------
  const archived = await api('PATCH', `/assessments/${assessmentId}`, {
    token: tokens.recruiter,
    body: { status: 'ARCHIVED' },
  });
  check(
    'PUBLISHED -> ARCHIVED transition works',
    archived.status === 200 && archived.json?.data?.assessment?.status === 'ARCHIVED',
    `status=${archived.status}`
  );
  const resurrect = await api('PATCH', `/assessments/${assessmentId}`, {
    token: tokens.recruiter,
    body: { status: 'PUBLISHED' },
  });
  check(
    'ARCHIVED is terminal (ARCHIVED -> PUBLISHED rejected) -> 400',
    resurrect.status === 400 && errEnvelope(resurrect.json),
    resurrect.json?.message
  );

  // ---------- 12. Soft delete (via API) ----------
  const softDeleteProblem = await api('DELETE', `/problems/${problemId}`, { token: tokens.recruiter });
  check('problem soft delete returns 200', softDeleteProblem.status === 200 && okEnvelope(softDeleteProblem.json));
  const goneProblem = await api('GET', `/problems/${problemId}`, { token: tokens.recruiter });
  check('soft-deleted problem is no longer readable -> 404', goneProblem.status === 404, `status=${goneProblem.status}`);

  const softDeleteAssessment = await api('DELETE', `/assessments/${assessmentId}`, { token: tokens.recruiter });
  check('assessment soft delete returns 200', softDeleteAssessment.status === 200 && okEnvelope(softDeleteAssessment.json));
  const goneAssessment = await api('GET', `/assessments/${assessmentId}`, { token: tokens.recruiter });
  check('soft-deleted assessment is no longer readable -> 404', goneAssessment.status === 404, `status=${goneAssessment.status}`);

  // ---------- 13. Cleanup of smoke fixtures ----------
  // Sweep any left-over SMOKE fixtures through the public API (soft delete).
  const staleAssessments = await api('GET', `/assessments?limit=50&search=${SMOKE_TAG}`, { token: tokens.recruiter });
  for (const stale of staleAssessments.json?.data?.assessments ?? []) {
    await api('DELETE', `/assessments/${stale.id}`, { token: tokens.recruiter });
  }
  const staleProblems = await api('GET', `/problems/search?q=${SMOKE_TAG}&limit=20`, { token: tokens.recruiter });
  for (const stale of staleProblems.json?.data?.problems ?? []) {
    await api('DELETE', `/problems/${stale.id}`, { token: tokens.recruiter });
  }
  console.log(
    `\ncleanup: soft-deleted ${staleAssessments.json?.data?.assessments?.length ?? 0} smoke assessment(s) and ${
      staleProblems.json?.data?.problems?.length ?? 0
    } smoke problem(s) via the API`
  );

  // Best-effort hard cleanup + restoring demo profile text (needs a free DB connection slot).
  const prisma = new PrismaClient();
  try {
    const assessments = await prisma.assessment.deleteMany({ where: { title: { startsWith: SMOKE_TAG } } });
    const problems = await prisma.problem.deleteMany({ where: { title: { startsWith: SMOKE_TAG } } });
    const recruiterUser = await prisma.user.findUnique({
      where: { email: CREDENTIALS.recruiter.email },
      select: { id: true },
    });
    if (recruiterUser) {
      await prisma.recruiterProfile
        .update({ where: { userId: recruiterUser.id }, data: { companyName: 'TechCorp Solutions' } })
        .catch(() => null);
    }
    const candidateUser = await prisma.user.findUnique({
      where: { email: CREDENTIALS.candidate.email },
      select: { id: true },
    });
    if (candidateUser) {
      await prisma.candidateProfile
        .update({ where: { userId: candidateUser.id }, data: { headline: 'Junior Backend Developer' } })
        .catch(() => null);
    }
    console.log(
      `cleanup: hard-removed ${assessments.count} assessment row(s) and ${problems.count} problem row(s); demo profiles restored`
    );
  } catch (err) {
    warn(
      'hard DB cleanup skipped (no free database connection slot while the API server holds the pool)',
      String(err.message).split('\n')[0]
    );
    console.log('       -> stop the API server and run `npm run smoke:clean` for the hard cleanup');
  } finally {
    await prisma.$disconnect().catch(() => null);
  }

  // ---------- Summary ----------
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failedResults = results.filter((r) => r.status === 'FAIL');
  const warned = results.filter((r) => r.status === 'WARN').length;
  console.log(`\n=== RESULT: ${passed} passed | ${failedResults.length} failed | ${warned} warning(s) ===`);
  if (failedResults.length > 0) {
    console.log('\nFailures:');
    for (const f of failedResults) console.log(`  FAIL  ${f.name}${f.detail ? `  -> ${f.detail}` : ''}`);
    process.exit(1);
  }
  console.log('All smoke checks passed.\n');
}

main().catch((err) => {
  console.error('SMOKE CRASHED:', err);
  process.exit(1);
});