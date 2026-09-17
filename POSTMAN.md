# Postman Collection Guide

Production base URL (`baseUrl`):

```
https://developerassessmentbackend.vercel.app/api/v1
```

Import `POSTMAN.json` (13 folders, 70 requests, 15 variables).
Run folders top-to-bottom against production.


## Authentication (real routes)

All protected endpoints use `Authorization: Bearer {{accessToken}}`.

1. **Register** — `POST {{baseUrl}}/auth/register` — `{name, email, password (8+ chars, letter+number), role: CANDIDATE|RECRUITER}` → 201 `{user, accessToken, refreshToken}`; duplicate → 409.
2. **Login** — `POST {{baseUrl}}/auth/login` — `{email, password}` → 200. Collection has Candidate/Admin/Recruiter variants; test scripts auto-save tokens.
3. **Google** — `POST {{baseUrl}}/auth/google` (alias `POST {{baseUrl}}/auth/social-login`) — `{credential: <Google ID token>, role?}` → 401 on invalid credential.
4. **Refresh** — `POST {{baseUrl}}/auth/refresh-token` — `{refreshToken}` → rotates; reuse → 401.
5. **Logout** — `POST {{baseUrl}}/auth/logout` — `{refreshToken}` → 200.
6. **Me** — `GET {{baseUrl}}/auth/me` — no/bad token → 401.
7. **Change password** — `PATCH {{baseUrl}}/auth/change-password` — `{currentPassword, newPassword}` → revokes sessions.

## Roles & Permissions

| Role | Can Access |
|------|-----------|
| **Candidate** | Own profile, PUBLISHED assessments, accept/reject invitations, start/submit attempts (invitation + payment + duplicate guards), own results/payments |
| **Recruiter** | Company profile, problem bank CRUD, assessment lifecycle + attach/detach, invitations, evaluation queue + manual evaluation, results/report |
| **Admin** | All recruiter powers + `/admin/*` user management, registers, dashboard stats, audit logs, Stripe refunds |

Wrong role → 403; cross-owner read → 404 (no leak); candidate on `/problems` → 403.

## Collection Structure (13 folders, 70 requests — matches live routes)

### Health (2)
- API Root `GET {{baseUrl}}`, Health Check `GET {{baseUrl}}/health`

### Authentication (9)
- Register, Login (Candidate/Admin/Recruiter), Google Login, Refresh Token, Logout, Me, Change Password (PATCH)

### Users (5, any role)
- Get Current User `GET /users/me`, Update `PATCH /users/me {name?, avatarUrl?}`
- Get My Role Profile `GET /users/me/profile`
- Update candidate fields / recruiter company fields `PATCH /users/me/profile` (wrong-role fields → 400)

### Admin (8, ADMIN only)
- List Users (pagination/filter/search/sort), Search Users, Update Status `{isActive}`, Update Role `{role}`, Dashboard Stats, List Payments, List Assessments, Audit Logs

### Problems (6, RECRUITER/ADMIN, flat body)
- Create MCQ (flat — no wrapper; `correctAnswer` must match an option), List (pagination/filter/sort), Search, Get by ID, Update, Delete (soft → 404)

### Assessments (8)
- Create DRAFT, List, Get by ID, Candidate Start `POST /assessments/:assessmentId/start`, Update + status lifecycle, Soft delete, Attach `{problemIds:[uuid]}`, Detach

### Invitations (4)
- Send (recruiter), List (scoped), Accept / Reject (candidate PATCH; start-before-accept → 409)

### Attempts (6)
- My History `GET /attempts/my-attempts` (candidate; recruiter → 403), Get by ID, Submit (deadline enforced), Create/List Submissions, Submission detail. No `POST /attempts/:id/start` — use assessments start.

### Submissions (1)
- Get Submission Detail `GET /submissions/:id` (ownership-checked)

### Evaluation (5)
- Candidate results/me, Pending queue, Evaluate (PATCH `{score, feedback?}`), Assessment results, Assessment report (cached)

### Results (7)
- My Results, Summary, Detail + breakdown (no `correctAnswer` leak, foreign → 404), Publish/Unpublish (audited, idempotent), Assessment results, Leaderboard

### Payments (6, real Stripe)
- Create checkout `{assessmentId}` (server price; tamper → 400; idempotent reuse), Webhook (public, signed — unsigned → 400 by design), Verify, Get by ID, My Payments, Refund (ADMIN)

### Error Responses (3, executable)
- 401 bad login, 403 candidate on `/admin/users`, 404 bad UUID

## Environment Variables (15, auto-captured via test scripts)

| Variable | Value |
|----------|-------|
| `baseUrl` | `https://developerassessmentbackend.vercel.app/api/v1` |
| `accessToken` / `refreshToken` / `adminToken` / `recruiterToken` / `candidateToken` | auto-saved on login/register |
| `userId` | auto-saved on login |
| `assessmentId` / `problemId` / `invitationId` / `paymentId` / `sessionId` / `resultId` / `attemptId` / `submissionId` | auto-saved on create/checkout/results |

Demo: `admin@assessment.com/Admin@1234`, `recruiter@assessment.com/Recruiter@1234`, `candidate@assessment.com/Candidate@1234`, `jane.candidate@assessment.com/Jane@1234`.

## Testing Workflow (production E2E order)
1. Health → API index (200 envelope).
2. Authentication → register/login all roles, refresh rotation, logout (401/409 cases).
3. Users → self + role profiles (+ 400 guard).
4. Admin → lists/stats/registers/audit logs (+ 403 cases).
5. Problems → flat MCQ create, 400 mismatch, list/search/pagination/filter/sort, soft delete → 404.
6. Assessments → DRAFT → publish-blocked 400 → attach `{problemIds}` → PUBLISHED → candidate no-leak → amount-tamper 400 → ARCHIVED terminal → soft delete 404.
7. Invitations → send → start-before-accept 409 → accept → paid start 402 (until Stripe PAID).
8. Attempts → my-attempts (+ recruiter 403), submit path.
9. Evaluation → pending queue, assessment results + cached report.
10. Results → seeded detail/breakdown, foreign 404, publish lifecycle, leaderboard, 400/404 cases.
11. Payments → checkout + idempotent reuse, verify/my-payments/get, webhook unsigned 400 by design, refund ADMIN.
12. Error Responses → 401/403/404 executable checks.

`npm run smoke https://developerassessmentbackend.vercel.app/api/v1` mirrors this: **87/87 PASS** on production.

## Error Codes
| Code | Meaning |
|------|---------|
| 200/201 | Success (201: register, problem/assessment/attempt-start/checkout/submission/invitation) |
| 400 | Validation (`errors[]`), bad transition, publish-without-problems, amount tamper, unsigned webhook |
| 401 | Missing/bad/expired token, bad credentials, bad Google credential, reused refresh |
| 402 | Payment Required — paid attempt before PAID |
| 403 | Forbidden — wrong role |
| 404 | Not Found — soft-deleted/foreign/unknown (no leak) |
| 409 | Conflict — duplicate email, start-before-accept, duplicate attempt |
| 429 | Failed-auth burst only (`skipSuccessfulRequests` protects valid runs) |
| 500 | Internal Server Error (envelope) |

## Soft Delete
Problems, assessments, and user deactivation are soft (`isDeleted`/`deletedAt`); reads → 404 after. Admin users filter `?isDeleted`.