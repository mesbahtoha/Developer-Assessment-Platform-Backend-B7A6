# 🧑‍💻 Developer Assessment & Coding Platform — Backend API

A production-ready REST API for companies to assess developers: recruiters build assessments from a problem bank, invite candidates, run timed attempts, and evaluate results — with real Stripe payments for paid assessments.

> **Backend-only project** — all functionality is demonstrated via API testing tools (Postman / Thunder Client). No frontend is required or included.

| | |
|---|---|
| **Live API** | `https://<your-project>.vercel.app` *(deployed — see [Live API](#-live-api))* |
| **API Docs** | `POSTMAN.json` collection + [Postman Documentation](#-postman-documentation) |
| **Demo Video** | [Demo Video](#-demo-video) |
| **Database** | PostgreSQL (Prisma ORM) |
| **Payments** | Stripe (real processing, signed webhooks, refunds) |

---

## 📌 Project Overview

The **Developer Assessment & Coding Platform** lets a company evaluate developer candidates at scale. The end-to-end workflow:

```
Company (Recruiter)
   │
   ▼
Create Assessment (DRAFT)
   │
   ▼
Add Problems (MCQ / CODE from the problem bank)
   │
   ▼
Publish Assessment (PUBLISHED)
   │
   ▼
Invite Candidates (unique invitation token)
   │
   ▼
Candidate Accepts Invitation
   │
   ▼
(If paid) Stripe Checkout → webhook confirms PAID
   │
   ▼
Candidate Starts Timed Attempt (deadline enforced)
   │
   ▼
Submissions (MCQ auto-evaluated, CODE sent to evaluator)
   │
   ▼
Evaluation (AUTO score + MANUAL review with feedback)
   │
   ▼
Result (score, percentage, pass/fail)
   │
   ▼
Company Report (attempt funnel + results, cached)
```

Every critical action is captured in **audit logs**, cached reads are served by **Redis**, and all endpoints return a **consistent JSON envelope**:

```json
// Success
{ "success": true, "message": "Operation successful", "data": {} }

// Error
{ "success": false, "message": "Something went wrong", "errors": [] }
```

---

## ✨ Features

- **Problem bank** — MCQ and CODE problems with difficulty, points, and tags (recruiter/admin only)
- **Assessment lifecycle** — `DRAFT → PUBLISHED → CLOSED → ARCHIVED` with strict state transitions (cannot publish without problems, etc.)
- **Candidate invitations** — unique token per candidate per assessment, accept/reject workflow
- **Paid assessments** — Stripe Checkout, price enforced **server-side**, webhook-confirmed, refund support
- **Timed attempts** — deadline is computed and stored server-side; late submissions are rejected
- **Submissions** — one per problem per attempt (enforced by a DB constraint)
- **Evaluation** — automatic MCQ scoring + manual code review with score and feedback
- **Results & reports** — per-attempt results, assessment leaderboard, attempt-funnel report (Redis-cached)
- **Anti-cheating basics** — answer keys never leak to candidates (responses are field-filtered), single attempt per candidate, server-side timing
- **Admin console** — user management, dashboard stats, payment/assessment registers, audit logs
- **Redis** — read-through cache for hot listings/reports/stats + shared rate-limit quota
- **QA suite** — `npm run smoke` (66 end-to-end checks) and `npm run test:rbac`

---

## 👥 Three Roles

| Role | Can do |
|---|---|
| **CANDIDATE** | Manage own profile; browse published assessments; accept/reject invitations; start/submit timed attempts; pay for paid assessments; view own results and payment history |
| **RECRUITER** | Manage company profile; own the problem bank (create/update/soft-delete problems); create assessments and manage their lifecycle; attach/detach problems; invite candidates; evaluate pending submissions; view results & reports |
| **ADMIN** | Everything the recruiter can do **plus** platform-wide user management (status/role changes), dashboard statistics, payment & assessment registers, audit logs, and Stripe refunds |

Role rules are enforced by middleware (`verifyAuth` + `authorize(...)` / `requireAdmin` / `requireCandidate` / `requireRecruiterOrAdmin`) **and** re-checked in services (ownership guards). A wrong role gets a structured `403 Forbidden`.

## 🛠️ Technology Stack

| Category | Technology | Purpose |
|---|---|---|
| Runtime | Node.js ≥ 18, TypeScript | Type-safe REST API |
| Framework | Express.js | Routing & middleware |
| Database | PostgreSQL + **Prisma** ORM | Relational data, migrations, transactions |
| Validation | **Zod** | Strict request body / query / params validation |
| Auth | jsonwebtoken, bcryptjs | JWT Bearer tokens + password hashing |
| Social login | Google Identity Services | GCP ID-token verification |
| Payments | **Stripe** (Checkout + webhooks + Refunds) | Real payment processing |
| Cache / rate limit | Redis (**ioredis**) | Read-through cache, shared rate-limit store |
| Security | helmet, cors, express-rate-limit | Headers, CORS allowlist, brute-force protection |
| Lint/Format | ESLint + Prettier | Code quality |
| QA | Custom smoke suite + RBAC unit script | 66 end-to-end checks |
| Deployment | Vercel (Serverless Functions) | Production hosting |

---

## 🏗️ Architecture

```
Client (Postman / any client)
      │  Bearer token
      ▼
Express app (helmet → cors → rate limit → json body)
      │
      ▼
Routes  ──▶  Middlewares (verifyAuth → authorize → validate)
      │
      ▼
Controllers  ──▶  Services (business logic, transactions, caching)
      │
      ▼
Prisma Client  ──▶  PostgreSQL
      │
      └──▶  Redis (cache + rate-limit counters)
```

- **Routes** (`src/modules/*/<module>.routes.ts`) declare endpoints + middleware chain.
- **Controllers** handle HTTP concerns only (parse, delegate, respond).
- **Services** own business logic, permission re-checks, Prisma queries, transactions, and cache invalidation.
- **Shared utilities** (`src/shared/`): `ApiResponse` (envelope), `ApiError`, `catchAsync`, `cache.ts` (Redis), `audit.ts` (audit log writer), `rateLimitStore.ts`.
- **Middlewares** (`src/middlewares/`): `auth`, `rbac`, `validate`, `globalErrorHandler`, `notFound`.

---

## 🗄️ Database Models

14 models + 8 enums (see `prisma/schema.prisma`):

| Model | Purpose | Key constraints / indexes |
|---|---|---|
| `User` | Accounts (email/password or Google) | `email` unique, `googleId` unique, soft delete, indexes on `role`, `createdAt` |
| `CandidateProfile` | Developer profile (skills, links) | 1:1 with User, index on `userId` |
| `RecruiterProfile` | Company profile | 1:1 with User, index on `userId` |
| `RefreshToken` | Rotating refresh sessions (hashed) | `tokenHash` unique, index on `userId` |
| `Problem` | MCQ / CODE problem bank | soft delete; indexes on `type`, `difficulty`, `createdById`, `createdAt` |
| `Assessment` | Assessment aggregate (status, duration, price, pass score) | soft delete; indexes on `status`, `recruiterId`, `createdAt` |
| `AssessmentProblem` | Ordered problems in an assessment (+ point override) | unique `[assessmentId, problemId]` |
| `Invitation` | Candidate invite with unique token + expiry | unique `[assessmentId, candidateId]`, indexed status |
| `Attempt` | Timed attempt (`startedAt`, `deadlineAt`) | **unique `[candidateId, assessmentId]`** prevents duplicate attempts |
| `Submission` | Answer per problem | unique `[attemptId, problemId]` |
| `Evaluation` | Score/feedback per submission | 1:1 with Submission (`submissionId` unique) |
| `Result` | Final attempt result (score, %, pass) | 1:1 with Attempt (`attemptId` unique) |
| `Payment` | Stripe payment record | `stripeSessionId` unique; indexes on `status`, `userId`, `assessmentId`, `createdAt` |
| `AuditLog` | Who did what to what | indexes on `action`, `createdAt` |

## 📚 API Documentation

- **Postman collection**: [`POSTMAN.json`](./POSTMAN.json) — import into Postman/Thunder Client. It covers every endpoint below with example bodies and role-based folders.
- **Human-readable guide**: [`POSTMAN.md`](./POSTMAN.md) — step-by-step walkthrough of the core flows.
- All responses use the global envelope; errors always include an `errors[]` array with field-level details from Zod.

## 🌍 API Endpoint List

Base URL: `/api/v1` — **62 endpoints** total.

### Authentication (7)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/auth/register` | Public | Register (default role: CANDIDATE) |
| POST | `/auth/login` | Public | Login, returns access + refresh tokens |
| POST | `/auth/refresh-token` | Public (refresh token) | Rotate refresh token, new access token |
| POST | `/auth/logout` | Authenticated | Revoke refresh session |
| POST | `/auth/change-password` | Authenticated | Change password (rehashes, revokes sessions) |
| POST | `/auth/google` | Public | Google (GCP) ID-token login / signup |
| GET | `/auth/me` | Authenticated | Current session user |

### Users / Profiles (4)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/users/me` | Authenticated | Own account |
| PATCH | `/users/me` | Authenticated | Update own account |
| GET | `/users/me/profile` | Authenticated | Own candidate/recruiter profile |
| PATCH | `/users/me/profile` | Authenticated | Update own profile |

### Problem Bank (6) — RECRUITER/ADMIN
| Method | Endpoint | Description |
|---|---|---|
| POST | `/problems` | Create MCQ/CODE problem |
| GET | `/problems` | List with `?page&limit&type&difficulty&tags` |
| GET | `/problems/search?q=` | Search by title/prompt |
| GET | `/problems/:id` | Single problem (answer key hidden from candidates) |
| PATCH | `/problems/:id` | Update problem |
| DELETE | `/problems/:id` | Soft delete |

### Assessments (9)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/assessments` | RECRUITER/ADMIN | Create assessment (DRAFT) |
| GET | `/assessments` | Authenticated | Role-scoped list with `?page&limit&status&search&sortBy` |
| GET | `/assessments/:id` | Authenticated | Details (candidates see only PUBLISHED) |
| POST | `/assessments/:assessmentId/start` | CANDIDATE | Start timed attempt (invitation + payment + duplicate guards) |
| PATCH | `/assessments/:id` | RECRUITER/ADMIN | Update + status transitions |
| DELETE | `/assessments/:id` | RECRUITER/ADMIN | Soft delete |
| POST | `/assessments/:id/problems` | RECRUITER/ADMIN | Attach problems (+ point overrides) |
| DELETE | `/assessments/:id/problems/:problemId` | RECRUITER/ADMIN | Detach problem |
| GET | `/assessments/my-assessments` | RECRUITER/ADMIN | Own assessments (filter/sort) |

### Invitations (4)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/invitations` | RECRUITER/ADMIN | Invite candidate (unique token) |
| GET | `/invitations` | Authenticated | Role-scoped list (sent vs received) with filters |
| PATCH | `/invitations/:id/accept` | CANDIDATE | Accept invitation |
| PATCH | `/invitations/:id/reject` | CANDIDATE | Reject invitation |

### Attempts & Submissions (6)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/attempts/my-attempts` | CANDIDATE | Own attempt history |
| GET | `/attempts/:id` | Authenticated | Attempt detail (ownership-checked) |
| POST | `/attempts/:attemptId/submissions` | CANDIDATE | Submit an answer (deadline enforced) |
| GET | `/attempts/:attemptId/submissions` | Authenticated | Submissions for an attempt |
| PATCH | `/attempts/:id/submit` | CANDIDATE | Finalize attempt (auto-evaluates MCQs) |
| GET | `/submissions/:id` | Authenticated | Single submission (ownership-checked) |

### Evaluation (4)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/evaluation/submissions/pending` | RECRUITER/ADMIN | Queue of submissions to review |
| PATCH | `/evaluation/submissions/:id/evaluate` | RECRUITER/ADMIN | Score a submission + feedback |
| GET | `/evaluation/assessments/:id/results` | RECRUITER/ADMIN | All results for an assessment |
| GET | `/evaluation/assessments/:id/report` | RECRUITER/ADMIN | Aggregated assessment report (cached) |

### Results (7)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/results/me` | CANDIDATE | Own results (`?assessmentId&isPassed&sortBy&sortOrder&page&limit`) |
| GET | `/results/me/summary` | CANDIDATE | Career aggregates: total/passed/failed, average & best % (cached) |
| GET | `/results/:id` | Authenticated | Result detail + per-problem breakdown (ownership-checked) |
| PATCH | `/results/:id/publish` | RECRUITER/ADMIN | Officially release a result (audited, idempotent) |
| PATCH | `/results/:id/unpublish` | RECRUITER/ADMIN | Retract a published result (audited, idempotent) |
| GET | `/results/assessment/:assessmentId` | RECRUITER/ADMIN | Assessment results with candidate search (`?isPassed&search`) |
| GET | `/results/assessment/:assessmentId/leaderboard` | RECRUITER/ADMIN | Ranked top-N candidates (Redis-cached) |


### Payments (6) — Stripe
| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/payments/create` | Authenticated | Create Stripe Checkout session for a paid assessment |
| POST | `/payments/webhook` | Public (Stripe-signed) | Confirm/refund payments from Stripe events |
| GET | `/payments/my-payments` | Authenticated | Own payment history (filter by status) |
| GET | `/payments/verify/:sessionId` | Authenticated | Verify a Checkout session post-redirect |
| GET | `/payments/:id` | Authenticated | Payment detail (ownership-checked) |
| POST | `/payments/:id/refund` | ADMIN | Issue a real Stripe refund |

### Admin (8) — ADMIN only
| Method | Endpoint | Description |
|---|---|---|
| GET | `/admin/users` | Paginated user list with `?role&status&search` |
| GET | `/admin/users/search` | Search users by name/email |
| PATCH | `/admin/users/:id/status` | Activate/ban (soft delete) a user |
| PATCH | `/admin/users/:id/role` | Change a user's role (audited) |
| GET | `/admin/dashboard-stats` | Platform statistics (cached) |
| GET | `/admin/payments` | Platform payment register (filters) |
| GET | `/admin/assessments` | Platform assessment register (filters) |
| GET | `/admin/audit-logs` | Audit trail with `?action&page&limit` |

## 💳 Payment Integration (Stripe — real processing)

Payments are **real** Stripe Checkout transactions (no simulation). The flow:

```
1. POST /payments/create { assessmentId }
      → server re-reads the assessment price from the DB (client price is ignored)
      → creates a Stripe Checkout Session (mode: payment, success/cancel URLs)
      → saves a PENDING Payment row with the unique stripeSessionId
      ← returns { paymentId, checkoutUrl }

2. Candidate pays on Stripe-hosted Checkout page.

3. Stripe POSTs the signed event to POST /payments/webhook
      → signature verified with STRIPE_WEBHOOK_SECRET (raw body, no auth)
      → checkout.session.completed  → Payment → PAID (idempotent; skips replays)
      → charge.refunded             → Payment → REFUNDED
      → amount tampering rejected   → session amount must match DB amount

4. Optional: GET /payments/verify/:sessionId
      → server re-fetches the session from Stripe API (belt & braces after redirect)
      → updates status and returns the payment

5. GET /payments/:id and GET /payments/my-payments track status:
      PENDING → PROCESSING → PAID / FAILED → REFUNDED

6. POST /payments/:id/refund (ADMIN)
      → calls Stripe Refunds API against the stored PaymentIntent
      → Stripe then fires charge.refunded → webhook marks REFUNDED
```

Security details:

- **Price is authoritative from the database**, never from the client payload.
- **Webhook signature verification** (`stripe.webhooks.constructEvent`) rejects forged requests.
- **Idempotency**: replays of `checkout.session.completed` don't double-credit.
- **Amount verification**: a paid session whose amount differs from the DB record is rejected.
- The `stripeSessionId` is unique at the DB level, so a session maps to exactly one `Payment` row.

---

## ✅ Validation (Zod)

Every POST/PATCH/PUT route — and every filtered GET — runs through the `validate()` middleware with a **Zod schema** for `body`, `query`, and/or `params`.

- Invalid input → HTTP `400` with the structured envelope and an `errors[]` array of `{ path, message }` entries, e.g.:

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "path": "body.email", "message": "Invalid email format" }
  ]
}
```

- Zod schemas are also the single source of truth for types: `z.infer<typeof schema>` feeds the controller/service signatures, so validation and types never drift.
- Unknown fields are stripped (`strict`/`.strip()`), and enum fields (roles, statuses, difficulty) are constrained to legal values.

## 🔒 Security

| Layer | How it's applied |
|---|---|
| **bcrypt** | Passwords hashed with bcrypt (salted) before storage; compare-on-login is timing-safe. Plain passwords are never logged or returned. |
| **JWT** | Short-lived signed **access tokens** (Bearer header). Refresh tokens are random, stored **hashed** in DB, **rotated** on every refresh, and revoked on logout/password change. |
| **RBAC** | `CANDIDATE` / `RECRUITER` / `ADMIN` enforced by route middleware **and** service-level ownership checks (a recruiter can't edit another recruiter's assessment; candidates can't read others' results). |
| **Helmet** | Sets secure HTTP headers (XSS protection, no-sniff, frameguard, HSTS, etc.) on every response. |
| **CORS** | Strict allow-list from `CLIENT_URL` env var; credentials handled explicitly. Unknown origins are rejected. |
| **Rate limiting** | `express-rate-limit` with a **Redis-backed store** (shared quota across serverless instances): a strict per-IP limit on auth endpoints (brute-force protection) plus a global API limit. Falls back to in-memory if Redis is unavailable. |
| **Environment variables** | All secrets (DB URL, JWT secrets, Stripe keys, Redis URL) live in env vars only — never in code or git. `.env` is git-ignored; `.env.example` documents required keys with placeholders. |
| **Other** | Zod validation on all inputs, Stripe webhook signature verification, server-side price & deadline enforcement, soft deletes, and full audit logging of privileged actions. |

---

## 🗃️ Database

- **PostgreSQL** — relational integrity across users, assessments, attempts, and payments; chosen for transactional guarantees.
- **Prisma ORM** — typed schema, generated client, declarative migrations (`prisma/migrations`), and `prisma db seed`.
- **Indexes** — added on every high-frequency filter/join column: `User.role`, `Assessment.status/recruiterId/createdAt`, `Problem.type/difficulty`, `Attempt.status`, `Submission.status`, `Payment.status/createdAt`, `AuditLog.action/createdAt`, etc.
- **Constraints** — `@unique` on emails, Google IDs, refresh-token hashes, Stripe session IDs; **composite uniques** prevent duplicate attempts `[candidateId, assessmentId]`, duplicate invitations `[assessmentId, candidateId]`, and duplicate submissions `[attemptId, problemId]`. Relations use proper `onDelete` behavior (`Cascade` / `SetNull`).
- **Transactions** — complex multi-step flows run inside `prisma.$transaction` to prevent race conditions: attempt creation (invitation check + payment check + duplicate guard + deadline computation), submission finalization (attempt update + MCQ auto-evaluation + result generation), payment confirmation, role updates.
- **Soft deletes** — `User`, `Problem`, and `Assessment` use `isDeleted`/`deletedAt`; all queries filter soft-deleted rows; nothing is hard-deleted.
- **Audit logs** — every privileged action (role change, user ban, assessment publish, refund, status change) writes an `AuditLog` with actor, action, target, and metadata, queryable via `GET /admin/audit-logs`.

## 🔎 Search / Filtering / Pagination

Advanced fetching is implemented across the list endpoints:

| Endpoint | Capabilities |
|---|---|
| `GET /assessments` | `?page&limit&status&search&sortBy&sortOrder` — role-scoped (candidates see PUBLISHED only, recruiters see own, admins see all) |
| `GET /problems` | `?page&limit&type&difficulty&tags` + `GET /problems/search?q=` search on title/prompt |
| `GET /invitations` | `?status&page&limit` — auto-scoped to sent (recruiter) vs received (candidate) |
| `GET /attempts/my-attempts` | `?status&page&limit` |
| `GET /results/me` | `?assessmentId&isPassed&sortBy&sortOrder&page&limit` |
| `GET /results/assessment/:assessmentId` | `?isPassed&search&page&limit` — candidate name/email search |
| `GET /payments/my-payments` | `?status&page&limit` |
| `GET /admin/users` | `?role&status&search&page&limit` + `GET /admin/users/search?q=` |
| `GET /admin/payments` | `?status&userId&page&limit` |
| `GET /admin/assessments` | `?status&recruiterId&search&page&limit` |
| `GET /admin/audit-logs` | `?action&page&limit` |

Pagination responses include a `meta` object (`page`, `limit`, `total`, `totalPages`).

---

## 🔑 Environment Variables

Copy `.env.example` → `.env` and fill in real values (placeholders only below):

```env
PORT=5000
NODE_ENV=development

# PostgreSQL (Prisma)
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DB?schema=public"

# Redis (cache + rate-limit store) — optional in dev, recommended in prod
REDIS_URL="redis://default:PASSWORD@HOST:6379"

# JWT
JWT_ACCESS_SECRET="replace-with-long-random-string"
JWT_REFRESH_SECRET="replace-with-another-long-random-string"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="30d"

# Google (GCP) login
GOOGLE_CLIENT_ID="your-google-oauth-client-id.apps.googleusercontent.com"

# Stripe
STRIPE_SECRET_KEY="sk_test_xxx"
STRIPE_WEBHOOK_SECRET="whsec_xxx"
STRIPE_SUCCESS_URL="https://your-app.example.com/payment/success"
STRIPE_CANCEL_URL="https://your-app.example.com/payment/cancel"

# CORS
CLIENT_URL="http://localhost:3000"

# Seed admin (used by prisma db seed)
ADMIN_NAME="Platform Admin"
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="ChangeMe-123!"

# Rate limiting (optional overrides)
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=300
AUTH_RATE_LIMIT_WINDOW_MS=900000
AUTH_RATE_LIMIT_MAX=20
```

> ⚠️ **Never commit real secrets.** `.env` is git-ignored; use `.env.example` as the template.

## 🚀 Local Setup

```bash
git clone https://github.com/mesbahtoha/Developer-Assessment-Platform-Backend-B7A6.git
cd Developer-Assessment-Platform-Backend-B7A6
npm install                # runs prisma generate via postinstall
cp .env.example .env       # then fill in your local values
```

## 🧱 Prisma Commands

```bash
npx prisma generate            # generate the typed Prisma Client
npx prisma migrate dev         # create/apply migrations locally
npx prisma migrate deploy      # apply migrations (CI/production)
npx prisma db seed             # seed admin + demo data
npx prisma studio              # browse the database
```

## ▶️ Run Development

```bash
npm run dev        # nodemon + tsx watch on src/server.ts
# API: http://localhost:5000/api/v1
```

## 📦 Build

```bash
npm run build      # TypeScript → dist/
npm run type-check # strict type check without emitting
npm start          # node dist/server.js (production start)
```

## 🧪 QA Scripts

```bash
npm run smoke        # 66 end-to-end checks against the running server
npm run smoke:clean  # remove smoke-test data afterwards
npm run test:rbac    # RBAC middleware unit checks
```

## ☁️ Production (Vercel)

```bash
npm i -g vercel
vercel --prod
```

- `vercel.json` routes all traffic to the serverless entry; `vercel-build` runs `prisma generate && npm run build`.
- Set all environment variables in the Vercel dashboard (Production environment).
- After first deploy, run `npx prisma migrate deploy` and `npx prisma db seed` once against the production DB.
- Use a **pooled** Postgres connection string (e.g., Prisma Accelerate / Supabase pooled) for serverless.
- Add the Stripe webhook endpoint (`https://<your-domain>/api/v1/payments/webhook`) in the Stripe dashboard.

## 👤 Admin Demo Credentials

Dedicated demo accounts created by `npm run seed` (used **only** for evaluation — not personal credentials):

| Role | Email | Password |
|---|---|---|
| **Admin** | `admin@assessment.com` | `Admin@1234` |
| Recruiter | `recruiter@assessment.com` | `Recruiter@1234` |
| Candidate | `candidate@assessment.com` | `Candidate@1234` |
| Candidate (with pre-evaluated demo result) | `jane.candidate@assessment.com` | `Jane@1234` |

These are overridable via the `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars at seed time. They are demo credentials only — no production secrets are stored in this repository.

---

## 🌐 Live API

> **Base URL:** `https://<your-project>.vercel.app/api/v1`
>
> *(Placeholder — update this with the final Vercel/Render production URL after the last deployment.)*

Quick health check after deploy:

```bash
curl https://<your-project>.vercel.app/api/v1
# → { "success": true, "message": "...", "data": { ... } }
```

## 📮 Postman Documentation

> **Collection import:** [`POSTMAN.json`](./POSTMAN.json) in the repo root — covers all 62 endpoints with role-based folders and example payloads.
>
> **Published docs (placeholder):** `https://documenter.getpostman.com/view/<your-collection-id>`
>
> *(Placeholder — publish the collection via Postman → "Publish" → replace this link after the final run.)*

## 🎥 Demo Video

> **(Placeholder)** — 5–10 minute API walkthrough covering:
> 1. Project & architecture overview
> 2. All 3 roles logging in + a `403 Forbidden` demo
> 3. Full CRUD + assessment lifecycle (create → problems → publish → invite → attempt → submit → evaluate)
> 4. Validation & error responses (400/401/404)
> 5. Stripe payment flow (create session → pay → webhook → PAID)
> 6. One technical challenge (e.g., Redis-backed rate limiting on Vercel serverless, or payment webhook idempotency)
>
> *Link: `https://drive.google.com/file/d/<your-video-id>/view` — update after recording.*

---

## 📄 Submission Summary

```
Project Name    : Developer Assessment & Coding Platform (Backend)
Backend Repo    : https://github.com/mesbahtoha/Developer-Assessment-Platform-Backend-B7A6
Live API        : https://<your-project>.vercel.app
API Docs        : https://documenter.getpostman.com/view/<your-collection-id>
Demo Video      : https://drive.google.com/file/d/<your-video-id>/view
Admin Email     : admin@assessment.com
Admin Password  : Admin@1234
```

---

Built with ❤️ by **Mesbah Toha** — B7A6 Backend Assignment.








