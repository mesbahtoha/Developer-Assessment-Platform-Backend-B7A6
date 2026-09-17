# Developer Assessment Platform — Backend (B7A6)

Secure REST API for assessments: problem bank, lifecycle, invitations,
timed attempts, submissions, evaluation, results, reports, Stripe payments.

## Submission

- Project: Developer Assessment & Coding Platform (Backend only)
- Backend repo: https://github.com/mesbahtoha/Developer-Assessment-Platform-B7A6
- Submission repo: https://github.com/mesbahtoha/Developer-Assessment-Platform-Backend-B7A6
- Live API: https://developer-assessment-platform-backend-b7a6.vercel.app
- API docs: POSTMAN.json (+ POSTMAN.md)
- Demo video: TODO (5-10 min Loom/Drive link)
- Admin: admin@assessment.com / Admin@1234

## Tech stack

Node.js + TypeScript + Express 4, PostgreSQL + Prisma 5, Zod, JWT
(access + rotating refresh), Google ID-token login, Stripe Checkout +
webhooks, helmet + CORS + rate-limit, transactions, audit logs.

## Roles

- CANDIDATE: profile, published assessments, accept/reject own invitations,
  start attempts (invitation + PAID gate), submissions, submit, own results.
- RECRUITER: problem bank CRUD (own), assessment lifecycle
  DRAFT to PUBLISHED to CLOSED to ARCHIVED, attach/detach, invite, pending
  queue, manual evaluation, results/report, checkout + own payments.
- ADMIN: users list/search/status/role, all payments/assessments,
  audit logs, dashboard stats, reports.

## Quick start

```bash
npm install
cp .env.example .env
npx prisma generate
npx prisma migrate dev
npm run seed
npm run dev
```

Health: `GET /api/v1/health`. Envelope:
success `{ success: true, message, data }`,
error `{ success: false, message, errors }`.

## Key endpoints (/api/v1)

Auth: `POST /auth/register|login|google|refresh-token|logout`,
`GET /auth/me`, `PATCH /auth/change-password`.
Users: `GET|PATCH /users/me`.
Problems (RECRUITER/ADMIN): CRUD + `GET /?page&limit&search&type&difficulty`
+ `GET /search?q=`.
Assessments: `POST /`, `GET /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`,
`POST /:id/problems`, `DELETE /:id/problems/:problemId`,
`POST /:assessmentId/start` (CANDIDATE).
Invitations: `POST /`, `GET /`, `PATCH /:id/accept|reject`.
Attempts: `GET /attempts/:id`, `PATCH /attempts/:id/submit`,
`POST|GET /attempts/:attemptId/submissions`, `GET /submissions/:id`.
Evaluation: `GET /evaluation/results/me`,
`GET /evaluation/submissions/pending`,
`PATCH /evaluation/submissions/:id/evaluate`,
`GET /evaluation/assessments/:id/results|report`.
Payments: `POST /payments/create`, `POST /payments/webhook` (public),
`GET /payments/verify/:sessionId`, `GET /payments/my-payments`, `GET /payments/:id`.
Admin (ADMIN): `GET /admin/users|users/search|payments|assessments|audit-logs|dashboard-stats`,
`PATCH /admin/users/:id/status {isActive}`, `PATCH /admin/users/:id/role {role}`.

Paid flow: create paid assessment, `POST /payments/create`,
pay at `url` (4242 4242 4242 4242), webhook marks PAID,
then `POST /assessments/:id/start`.

## Deploy (Vercel)

Build `npm run vercel-build` (prisma generate + tsc) to `dist/server.js`;
`vercel.json` routes `/(.*)` to it. Set `DATABASE_URL, JWT_ACCESS_SECRET,
JWT_REFRESH_SECRET, CLIENT_URL, GOOGLE_CLIENT_ID, STRIPE_SECRET_KEY,
STRIPE_WEBHOOK_SECRET, REDIS_URL` (optional but recommended: shared cache +
shared rate-limit quota across serverless instances), run
`prisma migrate deploy`, `npm run seed` once, verify `/api/v1/health`.

## Postman

Import `POSTMAN.json` (valid JSON, 10 folders, 54 requests). Env vars:
`baseUrl, adminToken, recruiterToken, candidateToken, refreshToken,
assessmentId, invitationId, attemptId, submissionId, paymentId, sessionId`.
See `POSTMAN.md` for flows and RBAC matrix.

## QA / Smoke tests

`npm run smoke` runs a 66-check end-to-end suite against a running API
(response envelope, auth + refresh rotation, RBAC 403s, validation 400s,
404s, soft delete, pagination/filter/sort/search, assessment lifecycle,
invitations, attempts, Redis cache behaviour, Stripe payment guards).
`npm run smoke:clean` removes smoke rows afterwards. `npm run test:rbac`
runs the RBAC unit checks.

## Scripts

`npm run dev|build|start|type-check|seed|smoke|smoke:clean|test:rbac`.
