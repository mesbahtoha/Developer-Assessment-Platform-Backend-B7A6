# 🧑‍💻 Developer Assessment & Coding Platform — Backend API

A **production-ready REST API** for companies to assess software developers. Recruiters can build assessments from a problem bank, invite candidates, manage timed attempts, evaluate submissions, and generate results and reports — with **real Stripe payment processing and signed webhooks** for paid assessments.

> **Backend-only project** — all functionality is demonstrated through API clients such as **Postman** and **Thunder Client**. No frontend is required or included.

|                        |                                                        |
| ---------------------- | ------------------------------------------------------ |
| **Live API**           | `https://developerassessmentbackend.vercel.app`        |
| **API Base URL**       | `https://developerassessmentbackend.vercel.app/api/v1` |
| **API Documentation**  | `POSTMAN.json` + `POSTMAN.md`                          |
| **Demo Video**         | See [Demo Video](#-demo-video)                         |
| **Database**           | PostgreSQL + Prisma ORM                                |
| **Payments**           | Stripe Checkout + Webhooks + Refunds                   |
| **Cache / Rate Limit** | Redis                                                  |
| **Deployment**         | Vercel                                                 |

---

## 📌 Project Overview

The **Developer Assessment & Coding Platform** provides a complete backend workflow for evaluating developer candidates.

### End-to-End Workflow

```text
Company / Recruiter
        │
        ▼
Create Assessment
      DRAFT
        │
        ▼
Add Problems
  MCQ / CODE
        │
        ▼
Publish Assessment
    PUBLISHED
        │
        ▼
Invite Candidates
  Unique Invitation
        │
        ▼
Candidate Accepts
        │
        ▼
   ┌────┴────┐
   │  Paid?  │
   └────┬────┘
        │
     Yes│
        ▼
Stripe Checkout
        │
        ▼
Signed Webhook
        │
        ▼
Payment Confirmed
        │
        ▼
Start Timed Attempt
        │
        ▼
Submit Answers
        │
        ├──────────────┐
        ▼              ▼
   MCQ Auto       CODE Manual
   Evaluation      Evaluation
        │              │
        └──────┬───────┘
               ▼
            Result
      Score / % / Pass
               │
               ▼
       Company Report
     Attempt Funnel + Stats
```

Every critical privileged action is recorded in **audit logs**. Frequently accessed data is served through **Redis caching**, and API responses follow a consistent JSON response envelope.

### Standard Response Format

**Success**

```json
{
  "success": true,
  "message": "Operation successful",
  "data": {}
}
```

**Error**

```json
{
  "success": false,
  "message": "Something went wrong",
  "errors": []
}
```

---

# ✨ Key Features

### 🧩 Problem Bank

* MCQ and CODE problems
* Difficulty levels
* Configurable points
* Tags
* Search and filtering
* Soft deletion
* Answer keys protected from candidates

### 📝 Assessment Management

* Assessment lifecycle:
  `DRAFT → PUBLISHED → CLOSED → ARCHIVED`
* Strict state transitions
* Cannot publish assessments without problems
* Attach/detach problems
* Configurable duration
* Configurable pass score
* Paid/free assessments

### 📩 Candidate Invitations

* Unique invitation per candidate/assessment
* Invitation expiry
* Accept/reject workflow
* Duplicate invitation protection

### ⏱️ Timed Attempts

* Server-side start time
* Server-side deadline
* Deadline enforcement
* Single attempt per candidate
* Duplicate attempt protection

### 📤 Submissions

* One submission per problem per attempt
* Database-level uniqueness constraint
* MCQ automatic evaluation
* CODE submissions available for manual review

### 🧑‍💻 Evaluation

* Automatic MCQ scoring
* Manual CODE evaluation
* Reviewer score
* Reviewer feedback
* Pending evaluation queue

### 📊 Results & Reports

* Per-attempt results
* Score and percentage
* Pass/fail status
* Candidate result history
* Assessment leaderboard
* Assessment statistics
* Attempt funnel reports
* Redis-cached reports

### 💳 Payments

* Stripe Checkout
* Server-side price validation
* Signed webhook verification
* Payment status tracking
* Idempotent webhook handling
* Stripe refund support
* Payment history

### 🔒 Security

* JWT authentication
* Refresh token rotation
* Role-based access control
* Ownership checks
* bcrypt password hashing
* Helmet
* CORS allowlist
* Redis-backed rate limiting
* Zod validation
* Audit logging
* Soft deletion

### 👨‍💼 Admin Console APIs

* User management
* Role management
* User status management
* Platform statistics
* Payment register
* Assessment register
* Audit logs
* Stripe refunds

### 🧪 Quality Assurance

* `npm run smoke` — 66 end-to-end checks
* `npm run smoke:clean` — clean smoke-test data
* `npm run test:rbac` — RBAC checks

---

# 👥 User Roles

| Role          | Capabilities                                                                                                                                                          |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CANDIDATE** | Manage profile, browse published assessments, accept/reject invitations, pay for assessments, start/submit timed attempts, view results and payment history           |
| **RECRUITER** | Manage company profile, manage own problem bank, create/manage assessments, attach/detach problems, invite candidates, evaluate submissions, view results and reports |
| **ADMIN**     | All recruiter capabilities plus platform-wide user management, dashboard statistics, payment/assessment registers, audit logs, and Stripe refunds                     |

### Authorization Architecture

Authorization is enforced at multiple layers:

```text
Request
   │
   ▼
verifyAuth
   │
   ▼
authorize(...)
   │
   ▼
Role-specific middleware
   │
   ▼
Controller
   │
   ▼
Service-level ownership checks
```

Examples:

* Candidate cannot access another candidate's results.
* Recruiter cannot modify another recruiter's assessment.
* Recruiter cannot manage another recruiter's private resources.
* Admin-only operations require `ADMIN`.
* Incorrect roles receive a structured `403 Forbidden`.

---

# 🛠️ Technology Stack

| Category          | Technology                | Purpose                                    |
| ----------------- | ------------------------- | ------------------------------------------ |
| Runtime           | Node.js ≥ 18              | Server runtime                             |
| Language          | TypeScript                | Type-safe development                      |
| Framework         | Express.js                | REST API framework                         |
| Database          | PostgreSQL                | Relational data storage                    |
| ORM               | Prisma                    | Database access, migrations & transactions |
| Validation        | Zod                       | Request validation & type inference        |
| Authentication    | JWT                       | Access/refresh token authentication        |
| Password Security | bcryptjs                  | Password hashing                           |
| Social Login      | Google Identity Services  | Google ID-token authentication             |
| Payments          | Stripe                    | Checkout, webhooks & refunds               |
| Cache             | Redis / ioredis           | Caching & shared rate-limit storage        |
| Security          | Helmet                    | Secure HTTP headers                        |
| CORS              | cors                      | Origin allowlist                           |
| Rate Limiting     | express-rate-limit        | API & authentication protection            |
| Code Quality      | ESLint + Prettier         | Linting & formatting                       |
| QA                | Custom smoke + RBAC tests | Automated verification                     |
| Deployment        | Vercel                    | Production hosting                         |

---

# 🏗️ System Architecture

```text
                 Client
          Postman / Thunder Client
                    │
                    │ Bearer Token
                    ▼
            ┌─────────────────┐
            │   Express API   │
            │                 │
            │ Helmet          │
            │ CORS            │
            │ Rate Limiting  │
            │ JSON Parser     │
            └────────┬────────┘
                     │
                     ▼
              ┌──────────────┐
              │    Routes    │
              └──────┬───────┘
                     │
                     ▼
        ┌─────────────────────────┐
        │      Middlewares        │
        │                         │
        │ verifyAuth              │
        │ authorize               │
        │ validate                │
        └───────────┬─────────────┘
                    │
                    ▼
             ┌────────────┐
             │ Controllers│
             └─────┬──────┘
                   │
                   ▼
             ┌────────────┐
             │  Services  │
             │            │
             │ Business   │
             │ Logic      │
             │ Ownership  │
             │Transactions│
             │ Caching    │
             └─────┬──────┘
                   │
                   |               
                   ▼                  
           ┌──────────────┐   
           │ Prisma ORM   │   
           └──────┬───────┘   
                  │
                  ▼
           ┌──────────────┐
           │  PostgreSQL  │
           └──────────────┘
```

### Layer Responsibilities

**Routes**

Define endpoints and middleware chains.

```text
src/modules/*/<module>.routes.ts
```

**Controllers**

Handle HTTP concerns:

* Request parsing
* Calling services
* Sending responses

**Services**

Contain the application's business logic:

* Authorization re-checks
* Ownership guards
* Prisma queries
* Transactions
* Cache handling
* Cache invalidation

**Shared Utilities**

```text
src/shared/
```

Includes:

* `ApiResponse`
* `ApiError`
* `catchAsync`
* `cache.ts`
* `audit.ts`
* `rateLimitStore.ts`

**Middlewares**

```text
src/middlewares/
```

Includes:

* Authentication
* RBAC
* Validation
* Global error handling
* 404 handling

---

# 🗄️ Database Design

The database contains **14 models and 8 enums**.

| Model               | Purpose                       | Important Constraints / Indexes                              |
| ------------------- | ----------------------------- | ------------------------------------------------------------ |
| `User`              | User accounts                 | Unique email/googleId, role & createdAt indexes, soft delete |
| `CandidateProfile`  | Candidate information         | 1:1 with User                                                |
| `RecruiterProfile`  | Company/recruiter information | 1:1 with User                                                |
| `RefreshToken`      | Refresh sessions              | Unique hashed token, user index                              |
| `Problem`           | MCQ/CODE problem bank         | Type, difficulty, creator & date indexes                     |
| `Assessment`        | Assessment aggregate          | Status, recruiter & date indexes                             |
| `AssessmentProblem` | Assessment/problem relation   | Unique `[assessmentId, problemId]`                           |
| `Invitation`        | Candidate invitation          | Unique `[assessmentId, candidateId]`, token                  |
| `Attempt`           | Timed assessment attempt      | Unique `[candidateId, assessmentId]`                         |
| `Submission`        | Answer per problem            | Unique `[attemptId, problemId]`                              |
| `Evaluation`        | Submission evaluation         | Unique `submissionId`                                        |
| `Result`            | Final assessment result       | Unique `attemptId`                                           |
| `Payment`           | Stripe payment record         | Unique Stripe session ID                                     |
| `AuditLog`          | Privileged action history     | Action/date indexes                                          |

### Important Database Constraints

```text
User
 └── email @unique

Invitation
 └── [assessmentId, candidateId] @unique

Attempt
 └── [candidateId, assessmentId] @unique

Submission
 └── [attemptId, problemId] @unique

Evaluation
 └── submissionId @unique

Result
 └── attemptId @unique

Payment
 └── stripeSessionId @unique
```

These constraints provide database-level protection against duplicate records and race conditions.

---

# 🔄 Transactions

Complex business operations use Prisma transactions through:

```typescript
prisma.$transaction(...)
```

Examples include:

* Starting an assessment
* Checking invitation + payment + duplicate attempt
* Computing attempt deadlines
* Finalizing submissions
* Automatic MCQ evaluation
* Result generation
* Payment confirmation
* Role changes

This ensures related database operations succeed or fail together.

---

# 📚 API Documentation

The repository contains two API documentation resources:

### 📮 Postman Collection

```text
POSTMAN.json
```

Contains:

* **70 requests**
* **13 folders**
* **15 collection variables**
* Example request bodies
* Role-specific requests
* Automated token/ID capture
* Error response examples

### 📖 Human-Readable Guide

```text
POSTMAN.md
```

Contains step-by-step instructions for testing the major application workflows.

---

# 🌍 API Endpoint Reference

### Base URL

```text
https://developerassessmentbackend.vercel.app/api/v1
```

---

## 🔐 Authentication — 8 Endpoints

| Method | Endpoint                | Access        | Description                  |
| ------ | ----------------------- | ------------- | ---------------------------- |
| POST   | `/auth/register`        | Public        | Register candidate account   |
| POST   | `/auth/login`           | Public        | Login and receive JWT tokens |
| POST   | `/auth/refresh-token`   | Public        | Rotate refresh token         |
| POST   | `/auth/logout`          | Authenticated | Revoke refresh session       |
| PATCH  | `/auth/change-password` | Authenticated | Change password              |
| POST   | `/auth/google`          | Public        | Google ID-token login        |
| POST   | `/auth/social-login`    | Public        | Alias of Google login        |
| GET    | `/auth/me`              | Authenticated | Get current user             |

> `/auth/login` is used by all three roles; the Postman collection provides role-specific login requests.

---

## 👤 Users & Profiles — 4 Endpoints

| Method | Endpoint            | Access        | Description        |
| ------ | ------------------- | ------------- | ------------------ |
| GET    | `/users/me`         | Authenticated | Get own account    |
| PATCH  | `/users/me`         | Authenticated | Update account     |
| GET    | `/users/me/profile` | Authenticated | Get own profile    |
| PATCH  | `/users/me/profile` | Authenticated | Update own profile |

---

## 🧩 Problem Bank — 6 Endpoints

**Access:** RECRUITER / ADMIN

| Method | Endpoint              | Description             |
| ------ | --------------------- | ----------------------- |
| POST   | `/problems`           | Create MCQ/CODE problem |
| GET    | `/problems`           | List/filter problems    |
| GET    | `/problems/search?q=` | Search problems         |
| GET    | `/problems/:id`       | Get problem details     |
| PATCH  | `/problems/:id`       | Update problem          |
| DELETE | `/problems/:id`       | Soft-delete problem     |

Supported filters include:

```text
?page
&limit
&type
&difficulty
&tags
```

---

## 📝 Assessments — 8 Endpoints

| Method | Endpoint                               | Access            | Description                 |
| ------ | -------------------------------------- | ----------------- | --------------------------- |
| POST   | `/assessments`                         | RECRUITER / ADMIN | Create assessment           |
| GET    | `/assessments`                         | Authenticated     | Role-scoped assessment list |
| GET    | `/assessments/:id`                     | Authenticated     | Assessment details          |
| POST   | `/assessments/:assessmentId/start`     | CANDIDATE         | Start timed attempt         |
| PATCH  | `/assessments/:id`                     | RECRUITER / ADMIN | Update assessment           |
| DELETE | `/assessments/:id`                     | RECRUITER / ADMIN | Soft-delete assessment      |
| POST   | `/assessments/:id/problems`            | RECRUITER / ADMIN | Attach problems             |
| DELETE | `/assessments/:id/problems/:problemId` | RECRUITER / ADMIN | Detach problem              |

Attach problems:

```json
{
  "problemIds": [
    "problem-uuid-1",
    "problem-uuid-2"
  ]
}
```

---

## 📩 Invitations — 4 Endpoints

| Method | Endpoint                  | Access            | Description             |
| ------ | ------------------------- | ----------------- | ----------------------- |
| POST   | `/invitations`            | RECRUITER / ADMIN | Invite candidate        |
| GET    | `/invitations`            | Authenticated     | Role-scoped invitations |
| PATCH  | `/invitations/:id/accept` | CANDIDATE         | Accept invitation       |
| PATCH  | `/invitations/:id/reject` | CANDIDATE         | Reject invitation       |

---

## ⏱️ Attempts & Submissions — 6 Endpoints

| Method | Endpoint                           | Access        | Description         |
| ------ | ---------------------------------- | ------------- | ------------------- |
| GET    | `/attempts/my-attempts`            | CANDIDATE     | Own attempt history |
| GET    | `/attempts/:id`                    | Authenticated | Attempt details     |
| POST   | `/attempts/:attemptId/submissions` | CANDIDATE     | Submit answer       |
| GET    | `/attempts/:attemptId/submissions` | Authenticated | List submissions    |
| PATCH  | `/attempts/:id/submit`             | CANDIDATE     | Finalize attempt    |
| GET    | `/submissions/:id`                 | Authenticated | Submission details  |

The server enforces the stored attempt deadline when accepting submissions.

---

## 🧑‍💻 Evaluation — 4 Endpoints

| Method | Endpoint                               | Access            | Description         |
| ------ | -------------------------------------- | ----------------- | ------------------- |
| GET    | `/evaluation/submissions/pending`      | RECRUITER / ADMIN | Pending evaluations |
| PATCH  | `/evaluation/submissions/:id/evaluate` | RECRUITER / ADMIN | Score + feedback    |
| GET    | `/evaluation/assessments/:id/results`  | RECRUITER / ADMIN | Assessment results  |
| GET    | `/evaluation/assessments/:id/report`   | RECRUITER / ADMIN | Aggregated report   |

---

## 📊 Results — 7 Endpoints

| Method | Endpoint                                        | Access            | Description           |
| ------ | ----------------------------------------------- | ----------------- | --------------------- |
| GET    | `/results/me`                                   | CANDIDATE         | Own results           |
| GET    | `/results/me/summary`                           | CANDIDATE         | Career/result summary |
| GET    | `/results/:id`                                  | Authenticated     | Result details        |
| PATCH  | `/results/:id/publish`                          | RECRUITER / ADMIN | Publish result        |
| PATCH  | `/results/:id/unpublish`                        | RECRUITER / ADMIN | Unpublish result      |
| GET    | `/results/assessment/:assessmentId`             | RECRUITER / ADMIN | Assessment results    |
| GET    | `/results/assessment/:assessmentId/leaderboard` | RECRUITER / ADMIN | Candidate leaderboard |

---

## 💳 Payments — 6 Endpoints

| Method | Endpoint                      | Access        | Description                    |
| ------ | ----------------------------- | ------------- | ------------------------------ |
| POST   | `/payments/create`            | Authenticated | Create Stripe Checkout session |
| POST   | `/payments/webhook`           | Stripe-signed | Process Stripe events          |
| GET    | `/payments/my-payments`       | Authenticated | Own payment history            |
| GET    | `/payments/verify/:sessionId` | Authenticated | Verify Checkout session        |
| GET    | `/payments/:id`               | Authenticated | Payment details                |
| POST   | `/payments/:id/refund`        | ADMIN         | Issue Stripe refund            |

---

## 👨‍💼 Admin — 8 Endpoints

**Access:** ADMIN only

| Method | Endpoint                  | Description             |
| ------ | ------------------------- | ----------------------- |
| GET    | `/admin/users`            | Paginated user register |
| GET    | `/admin/users/search`     | Search users            |
| PATCH  | `/admin/users/:id/status` | Activate/ban user       |
| PATCH  | `/admin/users/:id/role`   | Change user role        |
| GET    | `/admin/dashboard-stats`  | Platform statistics     |
| GET    | `/admin/payments`         | Payment register        |
| GET    | `/admin/assessments`      | Assessment register     |
| GET    | `/admin/audit-logs`       | Audit trail             |

---

# 💳 Stripe Payment Integration

The platform uses **real Stripe Checkout transactions** rather than simulated payments.

### Payment Lifecycle

```text
PENDING
   │
   ▼
PROCESSING
   │
   ├──────► FAILED
   │
   ▼
PAID
   │
   ▼
REFUNDED
```

### Payment Flow

```text
1. Candidate needs access to paid assessment
                │
                ▼
2. POST /payments/create
                │
                ▼
3. Server reads assessment price from DB
                │
                ▼
4. Stripe Checkout Session created
                │
                ▼
5. PENDING Payment record created
                │
                ▼
6. Candidate pays on Stripe
                │
                ▼
7. Stripe sends signed webhook
                │
                ▼
8. Webhook signature verified
                │
                ▼
9. Payment → PAID
                │
                ▼
10. Candidate starts assessment
```

### Payment Security

**Server-side pricing**

The assessment price is retrieved from the database. Client-provided pricing is not trusted.

**Webhook verification**

Stripe webhook signatures are verified using:

```text
STRIPE_WEBHOOK_SECRET
```

**Idempotency**

Repeated Stripe events do not create duplicate payment effects.

**Amount verification**

The Stripe session amount must match the amount stored for the payment.

**Database uniqueness**

```text
stripeSessionId @unique
```

ensures one Stripe Checkout session maps to one payment record.

### Refund Flow

```text
ADMIN
  │
  ▼
POST /payments/:id/refund
  │
  ▼
Stripe Refunds API
  │
  ▼
Stripe processes refund
  │
  ▼
charge.refunded webhook
  │
  ▼
Payment → REFUNDED
```

---

# 🔔 Stripe Webhook

Production endpoint:

```text
https://developerassessmentbackend.vercel.app/api/v1/payments/webhook
```

The webhook:

* Does not use JWT authentication
* Requires a valid Stripe signature
* Uses the raw request body
* Processes Stripe payment events
* Handles replay/idempotency
* Updates payment status

---

# 🧪 Stripe Test Mode

Use Stripe's test environment during development.

### Successful Payment

```text
4242 4242 4242 4242
```

### Declined Payment

```text
4000 0025 0000 3155
```

No real money should move while using Stripe Test Mode.

---

# ✅ Validation with Zod

All POST/PATCH/PUT endpoints and filtered GET endpoints use Zod validation.

Validation can cover:

```text
body
query
params
```

### Example Validation Error

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "path": "body.email",
      "message": "Invalid email format"
    }
  ]
}
```

### Benefits

* Strict input validation
* Type inference
* Consistent validation errors
* Enum enforcement
* Protection against unexpected input

Zod schemas are also used as the source for inferred TypeScript types:

```typescript
z.infer<typeof schema>
```

---

# 🔒 Security Architecture

| Security Layer            | Implementation                                  |
| ------------------------- | ----------------------------------------------- |
| **Password Security**     | bcrypt password hashing                         |
| **JWT**                   | Short-lived signed access tokens                |
| **Refresh Tokens**        | Random tokens stored as hashes and rotated      |
| **Session Revocation**    | Logout/password change revokes refresh sessions |
| **RBAC**                  | Candidate / Recruiter / Admin authorization     |
| **Ownership Guards**      | Service-level resource ownership validation     |
| **Helmet**                | Secure HTTP headers                             |
| **CORS**                  | Environment-based allowlist                     |
| **Rate Limiting**         | Redis-backed shared rate limits                 |
| **Input Validation**      | Zod                                             |
| **Payment Security**      | Stripe webhook signature verification           |
| **Price Protection**      | Server-side assessment price                    |
| **Timing Protection**     | Server-side attempt deadline                    |
| **Answer-Key Protection** | Candidate responses are field-filtered          |
| **Soft Delete**           | Protected resources are not hard-deleted        |
| **Audit Logging**         | Privileged actions recorded                     |

### Refresh Token Flow

```text
Login
  │
  ├── Access Token
  │
  └── Refresh Token
          │
          ▼
    Stored as Hash
          │
          ▼
     Token Refresh
          │
          ▼
 Old Token Revoked
          │
          ▼
 New Refresh Token
```

---

# 🗃️ Data Integrity

The platform uses PostgreSQL because the domain requires strong relational and transactional guarantees.

### Unique Constraints

Important uniqueness rules include:

```text
User.email
User.googleId
RefreshToken.tokenHash
Payment.stripeSessionId

AssessmentProblem
[assessmentId, problemId]

Invitation
[assessmentId, candidateId]

Attempt
[candidateId, assessmentId]

Submission
[attemptId, problemId]
```

### Soft Deletes

The following entities support soft deletion:

```text
User
Problem
Assessment
```

Records are retained instead of being physically removed.

---

# 🧾 Audit Logging

Privileged operations generate audit records containing information such as:

```text
Actor
Action
Target
Metadata
Timestamp
```

Examples:

* User role changes
* User activation/ban
* Assessment publishing
* Assessment status changes
* Refunds
* Other privileged administrative operations

Audit records can be queried through:

```http
GET /api/v1/admin/audit-logs
```

---

# 🔎 Search, Filtering & Pagination

List endpoints support pagination and filtering where applicable.

| Endpoint                  | Supported Features                           |
| ------------------------- | -------------------------------------------- |
| `/assessments`            | page, limit, status, search, sorting         |
| `/problems`               | page, limit, type, difficulty, tags          |
| `/problems/search`        | title/prompt search                          |
| `/invitations`            | status, page, limit                          |
| `/attempts/my-attempts`   | status, page, limit                          |
| `/results/me`             | assessment, pass status, sorting, pagination |
| `/results/assessment/:id` | pass status, candidate search, pagination    |
| `/payments/my-payments`   | status, page, limit                          |
| `/admin/users`            | role, status, search, pagination             |
| `/admin/payments`         | status, user, pagination                     |
| `/admin/assessments`      | status, recruiter, search, pagination        |
| `/admin/audit-logs`       | action, page, limit                          |

Pagination responses include metadata:

```json
{
  "page": 1,
  "limit": 10,
  "total": 100,
  "totalPages": 10
}
```

---

# ⚡ Redis Caching

Redis is used for frequently accessed data and shared rate-limit state.

### Cached Resources

Examples include:

* Assessment listings
* Assessment reports
* Leaderboards
* Dashboard statistics
* Result summaries

### Cache Strategy

```text
Request
   │
   ▼
Check Redis
   │
   ├── HIT ──► Return Cached Data
   │
   └── MISS
         │
         ▼
      PostgreSQL
         │
         ▼
      Store Cache
         │
         ▼
      Return Data
```

Relevant mutations invalidate affected cache entries to prevent stale results.

---

# 📈 Role-Scoped Data Access

The same endpoint can return different data depending on the authenticated role.

Example:

```http
GET /assessments
```

### Candidate

```text
Published assessments available to the candidate
```

### Recruiter

```text
Recruiter's own assessments
```

### Admin

```text
Platform-wide assessment access
```

This prevents clients from bypassing authorization simply by changing query parameters.

---

# 🌱 Environment Variables

Copy:

```text
.env.example
```

to:

```text
.env
```

Example configuration:

```env
PORT=5000
NODE_ENV=development

# PostgreSQL
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DB?schema=public"

# Redis
REDIS_URL="redis://default:PASSWORD@HOST:6379"

# JWT
JWT_ACCESS_SECRET="replace-with-long-random-string"
JWT_REFRESH_SECRET="replace-with-another-long-random-string"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="30d"

# Google
GOOGLE_CLIENT_ID="your-google-client-id.apps.googleusercontent.com"

# Stripe
STRIPE_SECRET_KEY="sk_test_xxx"
STRIPE_WEBHOOK_SECRET="whsec_xxx"
STRIPE_SUCCESS_URL="https://your-app.example.com/payment/success"
STRIPE_CANCEL_URL="https://your-app.example.com/payment/cancel"

# CORS
CLIENT_URL="http://localhost:3000"

# Seed Admin
ADMIN_NAME="Platform Admin"
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="ChangeMe-123!"

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=300
AUTH_RATE_LIMIT_WINDOW_MS=900000
AUTH_RATE_LIMIT_MAX=20
```

> ⚠️ **Never commit real secrets to Git.** The `.env` file should remain git-ignored. Use `.env.example` for documentation.

---

# 🚀 Local Development

## Prerequisites

Install:

* Node.js ≥ 18
* npm
* PostgreSQL
* Redis
* Stripe CLI *(for local webhook testing)*
* Postman or Thunder Client

---

## Installation

```bash
git clone https://github.com/mesbahtoha/Developer-Assessment-Platform-Backend-B7A6.git

cd Developer-Assessment-Platform-Backend-B7A6

npm install

cp .env.example .env
```

Then configure your environment variables.

---

# 🧱 Prisma Commands

Generate Prisma Client:

```bash
npx prisma generate
```

Create/apply development migration:

```bash
npx prisma migrate dev
```

Apply production migrations:

```bash
npx prisma migrate deploy
```

Seed the database:

```bash
npx prisma db seed
```

Open Prisma Studio:

```bash
npx prisma studio
```

---

# ▶️ Development Server

```bash
npm run dev
```

Local API:

```text
http://localhost:5000/api/v1
```

---

# 📦 Production Build

```bash
npm run build
```

Type checking:

```bash
npm run type-check
```

Production start:

```bash
npm start
```

---

# 🧪 QA & Testing

### Smoke Tests

```bash
npm run smoke
```

Runs approximately **66 end-to-end checks** against the running API.

### Clean Smoke Data

```bash
npm run smoke:clean
```

### RBAC Tests

```bash
npm run test:rbac
```

These tests verify role-based authorization behavior.

---

# ☁️ Deployment — Vercel

The backend is deployed as Vercel serverless functions.

```bash
npm i -g vercel

vercel --prod
```

### Production Checklist

1. Configure all environment variables in Vercel.
2. Ensure the production PostgreSQL database is accessible.
3. Run Prisma migrations.
4. Seed only the required demo data.
5. Configure Redis.
6. Configure Stripe production/test keys as appropriate.
7. Configure the Stripe webhook.
8. Verify the health endpoint.
9. Run the smoke suite against the deployed API.

### Stripe Production Webhook

```text
https://developerassessmentbackend.vercel.app/api/v1/payments/webhook
```

---

# 👤 Demo Accounts

The seed script creates dedicated development/evaluation accounts.

| Role          | Email                           | Password         |
| ------------- | ------------------------------- | ---------------- |
| **ADMIN**     | `admin@assessment.com`          | `Admin@1234`     |
| **RECRUITER** | `recruiter@assessment.com`      | `Recruiter@1234` |
| **CANDIDATE** | `candidate@assessment.com`      | `Candidate@1234` |
| **CANDIDATE** | `jane.candidate@assessment.com` | `Jane@1234`      |

The admin seed credentials can be overridden using:

```env
ADMIN_EMAIL=
ADMIN_PASSWORD=
```

> ⚠️ These are demo credentials for evaluation/testing only and should not be used as production credentials.

---

# 🌐 Live API

### Production Base URL

```text
https://developerassessmentbackend.vercel.app
```

### API v1

```text
https://developerassessmentbackend.vercel.app/api/v1
```

### Health Check

```bash
curl https://developerassessmentbackend.vercel.app/api/v1/health
```

Expected response follows the standard API envelope:

```json
{
  "success": true,
  "message": "API is healthy",
  "data": {
    "status": "ok"
  }
}
```

---

## 📮 Postman Documentation

The project includes a complete Postman collection and detailed API testing documentation.

### 📖 Human-Readable Postman Guide

Complete API testing guide, environment setup, demo credentials, authentication flow, Stripe testing, RBAC testing, and recommended testing order:

👉 [**POSTMAN.md — Complete API Documentation & Testing Guide**](https://github.com/mesbahtoha/Developer-Assessment-Platform-Backend-B7A6/blob/main/POSTMAN.md)

### 📦 Postman Collection

Ready-to-import Postman collection containing the project's API requests:

👉 [**POSTMAN.json — Importable Postman Collection**](https://github.com/mesbahtoha/Developer-Assessment-Platform-Backend-B7A6/blob/main/POSTMAN.json)

### 🚀 Quick Start with Postman

1. Download or import **POSTMAN.json** into Postman.
2. Create/select the `DeveloperAssessment` environment.
3. Configure the required environment variables.
4. Login using one of the provided demo accounts.
5. Save the returned JWT tokens.
6. Follow the recommended API testing workflow.
7. Use **POSTMAN.md** for detailed endpoint documentation and testing instructions.


---

# 🎥 Demo Video

The demo video demonstrates the major backend workflows:

1. Project and architecture overview
2. Admin, recruiter, and candidate authentication
3. RBAC and `403 Forbidden` demonstration
4. Problem creation and management
5. Assessment lifecycle
6. Candidate invitation workflow
7. Timed assessment attempt
8. Submission and evaluation
9. Validation/error handling
10. Stripe Checkout
11. Stripe webhook confirmation
12. Redis/caching or another technical implementation highlight

> **Demo Video:** Add the final Google Drive/video URL here after recording.

---

# 📊 Project Statistics

| Metric               |          Value |
| -------------------- | -------------: |
| API Requests         |         **70** |
| API Modules          |         **13** |
| Collection Variables |         **15** |
| Database Models      |         **14** |
| Database Enums       |          **8** |
| Smoke Tests          |         **66** |
| User Roles           |          **3** |
| Payment Provider     |     **Stripe** |
| Cache                |      **Redis** |
| ORM                  |     **Prisma** |
| Database             | **PostgreSQL** |
| Deployment           |     **Vercel** |

---

# 📁 High-Level Project Structure

```text
Developer-Assessment-Platform-Backend-B7A6/
│
├── prisma/
│   ├── migrations/
│   ├── schema.prisma
│   └── seed.ts
│
├── src/
│   ├── config/
│   ├── middlewares/
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── problems/
│   │   ├── assessments/
│   │   ├── invitations/
│   │   ├── attempts/
│   │   ├── submissions/
│   │   ├── evaluation/
│   │   ├── results/
│   │   ├── payments/
│   │   └── admin/
│   │
│   ├── shared/
│   │   ├── ApiError/
│   │   ├── ApiResponse/
│   │   ├── audit/
│   │   ├── cache/
│   │   └── rateLimitStore/
│   │
│   └── server.ts
│
├── POSTMAN.json
├── POSTMAN.md
├── .env.example
├── package.json
├── tsconfig.json
├── vercel.json
└── README.md
```

---

# 🔄 Complete Business Flow

```text
                    ┌──────────────┐
                    │   Recruiter  │
                    └──────┬───────┘
                           │
                           ▼
                  Create Assessment
                           │
                           ▼
                    Add Problems
                           │
                           ▼
                       Publish
                           │
                           ▼
                    Invite Candidate
                           │
                           ▼
                    Accept Invitation
                           │
                           ▼
                    ┌──────────────┐
                    │   Payment?   │
                    └──────┬───────┘
                           │
                     ┌─────┴─────┐
                     │           │
                    YES          NO
                     │           │
                     ▼           │
              Stripe Checkout    │
                     │           │
                     ▼           │
              Signed Webhook     │
                     │           │
                     └─────┬─────┘
                           ▼
                    Start Attempt
                           │
                           ▼
                   Timed Assessment
                           │
                           ▼
                     Submit Answers
                           │
                 ┌─────────┴─────────┐
                 ▼                   ▼
             MCQ Auto            CODE Manual
             Evaluation           Evaluation
                 │                   │
                 └─────────┬─────────┘
                           ▼
                         Result
                           │
                           ▼
                  Recruiter / Admin
                           │
                           ▼
                    Reports & Stats
```

---

# 🏆 Engineering Highlights

This project demonstrates practical backend engineering concepts beyond basic CRUD:

* **Layered architecture** with routes, controllers, services, and shared utilities
* **Role-based authorization** with service-level ownership protection
* **Transactional database operations** using Prisma
* **Database-level uniqueness constraints**
* **Server-side payment amount enforcement**
* **Stripe webhook signature verification**
* **Webhook idempotency**
* **Real Stripe refunds**
* **Server-side assessment deadlines**
* **Answer-key protection**
* **Redis-backed distributed rate limiting**
* **Redis read-through caching**
* **Cache invalidation**
* **Soft deletion**
* **Audit logging**
* **Zod-driven validation and type inference**
* **Pagination, filtering, sorting, and search**
* **Automated end-to-end smoke testing**
* **RBAC verification**
* **Serverless deployment considerations**

---

# 📄 Submission Summary

```text
Project Name
Developer Assessment & Coding Platform — Backend API

Backend Repository
https://github.com/mesbahtoha/Developer-Assessment-Platform-Backend-B7A6

Live API
https://developerassessmentbackend.vercel.app

API Base URL
https://developerassessmentbackend.vercel.app/api/v1

API Documentation
POSTMAN.json + POSTMAN.md

Database
PostgreSQL + Prisma

Payments
Stripe Checkout + Webhooks + Refunds

Cache
Redis

Deployment
Vercel

Roles
ADMIN / RECRUITER / CANDIDATE
```

---

## 👨‍💻 Author

**Mesbah Toha**

Backend-focused developer building scalable REST APIs with **TypeScript, Node.js, Express, PostgreSQL, Prisma, Redis, JWT, and Stripe**.

---

> **Developer Assessment & Coding Platform**
> A complete backend system for creating assessments, inviting candidates, running timed developer evaluations, processing payments, evaluating submissions, and generating results — built with production-oriented architecture and security practices.
