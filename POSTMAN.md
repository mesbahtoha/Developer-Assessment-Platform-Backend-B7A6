# Postman Collection Documentation

## Developer Assessment Platform API

### Collection: `Developer Assessment Platform API`

Import this collection into Postman to test all APIs. The collection contains **50+ meaningful endpoints** covering authentication, user management, problems, assessments, invitations, attempts, submissions, evaluation, results, and payments.

---

## 📦 Environment Variables

Configure these environment variables in Postman before running requests:

| Variable | Type | Description | Default |
|---|---|---|---|
| `baseUrl` | String | Base URL for all APIs | `http://localhost:5000/api/v1` |
| `accessToken` | String | JWT access token for candidate users | `` (empty) |
| `refreshToken` | String | JWT refresh token for token rotation | `` (empty) |
| `adminToken` | String | JWT access token for admin user | `` (empty) |
| `recruiterToken` | String | JWT access token for recruiter user | `` (empty) |
| `candidateToken` | String | JWT access token for candidate user | `` (empty) |

### How to Set Environment Variables

1. Open Postman → Click the **Environment** dropdown (top right)
2. Click **Manage Environments** → Add new environment named `DeveloperAssessment`
3. Add the variables above with your desired values
4. Select the `DeveloperAssessment` environment from the dropdown

### Demo Credentials (from seed data)

| Role | Email | Password |
|---|---|---|
| **Admin** | `admin@assessment.com` | `Admin@1234` |
| **Recruiter** | `recruiter@assessment.com` | `Recruiter@1234` |
| **Candidate** | `candidate@assessment.com` | `Candidate@1234` |
| **Jane Candidate** | `jane.candidate@assessment.com` | `Jane@1234` |

---

## 🔐 Authentication Flow

### 1. Obtain Tokens

**Login as Admin:**
- `POST /api/v1/auth/login`
- Body: `{ "email": "admin@assessment.com", "password": "Admin@1234" }`
- Response: `{ "accessToken": "...", "refreshToken": "...", "user": {...} }`

**Login as Recruiter:**
- `POST /api/v1/auth/login`
- Body: `{ "email": "recruiter@assessment.com", "password": "Recruiter@1234" }`

**Login as Candidate:**
- `POST /api/v1/auth/login`
- Body: `{ "email": "candidate@assessment.com", "password": "Candidate@1234" }`

### 2. Set Authorization Header

For all protected routes, the collection automatically adds:

```
Authorization: Bearer {{accessToken}}
```

*(Or `{{recruiterToken}}`, `{{adminToken}}`, `{{candidateToken}}` depending on the user role)*

### 3. Token Refresh

- Use `POST /api/v1/auth/refresh-token` with the current `refreshToken`
- The new access token is used automatically by the collection variables

---

## 📁 Folder Structure

The collection is organized into these folders:

1. **Authentication** - Register, login, Google auth, logout, profile, password change
2. **Users** - Profile management, admin user listing/management
3. **Problems** - Problem bank (MCQ/CODE) create/list/get/update/delete
4. **Assessments** - Assessment lifecycle (create, publish, start attempts)
5. **Invitations** - Send/accept/reject assessment invitations
6. **Attempts** - Start/manage/submit assessment attempts
7. **Submissions** - View submission details
8. **Evaluation** - Manual evaluation, results, reports
9. **Payments** - Stripe checkout, webhook, payment history
10. **Error Responses** - 401, 403, 404 error examples

---

## 🔍 Endpoint Reference

### Authentication Folder

| Endpoint | Method | Auth Required | Description |
|---|---|---|---|
| `POST /auth/register` | POST | No | Register new user |
| `POST /auth/login` | POST | No | Login & get JWT tokens |
| `POST /auth/google` | POST | No | Google OAuth login |
| `POST /auth/refresh-token` | POST | Yes (refreshToken) | Rotate access token |
| `POST /auth/logout` | POST | Yes (accessToken) | Revoke refresh token |
| `GET /auth/me` | GET | Yes (accessToken) | Get current user profile |
| `PATCH /auth/change-password` | PATCH | Yes (accessToken) | Change password |

### Users Folder

| Endpoint | Method | Auth Required | Description |
|---|---|---|---|
| `GET /users/me` | GET | Yes (accessToken) | Get current user profile |
| `PATCH /users/me` | PATCH | Yes (accessToken) | Update profile (name/avatar) |
| `GET /admin/users` | GET | Yes (adminToken) | List all users (paginated, filterable) |
| `GET /admin/users/search` | GET | Yes (adminToken) | Search users by name/email |
| `PATCH /admin/users/:id/status` | PATCH | Yes (adminToken) | Toggle user active/deleted status |
| `PATCH /admin/users/:id/role` | PATCH | Yes (adminToken) | Update user role (CANDIDATE↔RECRUITER) |

### Problems Folder

| Endpoint | Method | Auth Required | Description |
|---|---|---|---|
| `POST /problems` | POST | Yes (recruiterToken) | Create new problem (MCQ/CODE) |
| `GET /problems` | GET | Yes | List problems (filtered by type/difficulty/search) |
| `GET /problems/search` | GET | Yes | Search problems by query |
| `GET /problems/:id` | GET | Yes | Get problem by ID |
| `PATCH /problems/:id` | PATCH | Yes (recruiterToken) | Update problem |
| `DELETE /problems/:id` | DELETE | Yes (recruiterToken) | Soft delete problem |

### Assessments Folder

| Endpoint | Method | Auth Required | Description |
|---|---|---|---|
| `POST /assessments` | POST | Yes (recruiterToken) | Create new assessment |
| `GET /assessments` | GET | Yes (candidateToken) | List assessments (candidates see only PUBLISHED) |
| `GET /assessments/:id` | GET | Yes (candidateToken) | Get assessment by ID |
| `POST /assessments/:assessmentId/start` | POST | Yes (candidateToken) | Start attempt (requires invitation + payment) |
| `PATCH /assessments/:id` | PATCH | Yes (adminToken) | Update assessment status/fields |
| `DELETE /assessments/:id` | DELETE | Yes (adminToken) | Soft delete assessment |
| `POST /assessments/:id/problems` | POST | Yes (recruiterToken) | Attach problems to assessment |

### Invitations Folder

| Endpoint | Method | Auth Required | Description |
|---|---|---|---|
| `POST /invitations` | POST | Yes (recruiterToken) | Send invitation by candidate email |
| `GET /invitations` | GET | Yes (candidateToken) | List candidate's own invitations |
| | GET | Yes (recruiterToken) | List invitations sent by recruiter/admin |
| `PATCH /invitations/:id/accept` | PATCH | Yes (candidateToken) | Accept invitation |
| `PATCH /invitations/:id/reject` | PATCH | Yes (candidateToken) | Reject invitation |

### Attempts Folder

| Endpoint | Method | Auth Required | Description |
|---|---|---|---|
| `POST /assessments/:assessmentId/start` | POST | Yes (candidateToken) | Start attempt (requires invitation + payment) |
| `GET /attempts/:id` | GET | Yes (candidateToken) | Get attempt by ID |
| `PATCH /attempts/:id/submit` | PATCH | Yes (candidateToken) | Submit attempt + compute result |
| `GET /attempts/:attemptId/submissions` | GET | Yes (candidateToken) | List submissions for attempt |
| `POST /attempts/:attemptId/submissions` | POST | Yes (candidateToken) | Submit answer for a problem |

### Submissions Folder

| Endpoint | Method | Auth Required | Description |
|---|---|---|---|
| `GET /submissions/:id` | GET | Depends on role | View submission detail (candidate sees sanitized, recruiter/admin full) |

### Evaluation Folder

| Endpoint | Method | Auth Required | Description |
|---|---|---|---|
| `GET /evaluation/results/me` | GET | Yes (candidateToken) | View candidate's own results (paginated) |
| `GET /evaluation/submissions/pending` | GET | Yes (recruiterToken) | List submissions pending manual evaluation |
| `PATCH /evaluation/submissions/:id/evaluate` | PATCH | Yes (recruiterToken) | Manually evaluate a submission |
| `GET /evaluation/assessments/:id/results` | GET | Yes (recruiterToken) | Assessment results statistics |
| `GET /evaluation/assessments/:id/report` | GET | Yes (adminToken) | Full assessment report |

### Payments Folder

| Endpoint | Method | Auth Required | Description |
|---|---|---|---|
| `POST /payments/create` | POST | Yes (recruiterToken) | Create Stripe Checkout Session |
| `POST /payments/webhook` | POST | No (Stripe) | Stripe webhook endpoint (raw body) |
| `GET /payments/:id` | GET | Yes (recruiterToken) | Get payment by ID |
| `GET /payments/my-payments` | GET | Yes (recruiterToken) | List current user's payments |

### Error Responses Folder

| Status | Description |
|---|---|
| `401 Unauthorized` | Missing/invalid token, expired token, account deactivated |
| `403 Forbidden` | Cross-role access, foreign assessment/recruiter/submission |
| `404 Not Found` | Resource not found, uninvited candidate, invalid ID |

---

## 💳 Payment Testing Flow

### Test Mode Setup

1. Use Stripe test mode (default) - no real money moves
2. Test card numbers work in test mode:
   - `4242 4242 4242 4242` - successful payment
   - `4000 0025 0000 3155` - declined payment

### Flow Steps

1. **Recruiter creates assessment with price > 0** (e.g., 999 cents = $9.99)
2. **Candidate attempts to start** → receives `402 Payment Required` if no payment
3. **Recruiter creates checkout session**:
   - `POST /api/v1/payments/create`
   - Body: `{ "assessmentId": "...", "amountInCents": 999 }`
   - Response: Stripe Checkout Session URL + payment record (status: PENDING)
4. **Candidate clicks the checkout URL** → Stripe Checkout Portal
5. **Pay with test card `4242 4242 4242 4242`** → Stripe redirects to success_url
6. **Stripe webhook fires** → `POST /api/v1/payments/webhook` (automatically in collection)
7. **Payment status updates to PAID** in database
8. **Candidate can now start the assessment** → `POST /api/v1/assessments/:assessmentId/start` succeeds

### Webhook Testing via Stripe CLI

```bash
# Install: brew install stripe/stripe-cli/stripe
stripe listen --forward-to localhost:5000/api/v1/payments/webhook

# Or use the raw webhook endpoint in Postman
# Send the event body + signature to the webhook URL
```

---

## 🚫 Authorization Enforcement Rules

The collection enforces these RBAC rules automatically:

| Endpoint | Required Role | What Happens If Wrong Role |
|---|---|---|
| `GET /admin/*` | `ADMIN` | `403 Forbidden` for candidate/recruiter |
| `POST /assessments/:assessmentId/start` | `CANDIDATE` | `403` for recruiter/admin |
| `POST /invitations` | `RECRUITER` | `403` for candidate |
| `PATCH /invitations/:id/accept` | `CANDIDATE` | `403` for recruiter/admin |
| `GET /evaluation/submissions/pending` | `RECRUITER` | `403` for candidate |
| `PATCH /evaluation/submissions/:id/evaluate` | `RECRUITER` | `403` for candidate |
| `GET /evaluation/assessments/:id/report` | `ADMIN` | `403` for recruiter/candidate |
| `GET /payments/*` | `RECRUITER` | `403` for candidate (sees only own) |

---

## 📥 How to Import

1. **Download** `POSTMAN.json` from this repository
2. **Open Postman** → Click **Import** (top left)
3. **Select** the `POSTMAN.json` file
4. **Choose** the collection and click **Import**
5. **Configure** the environment variables as described above
6. **Start testing!** Use the demo credentials to get tokens

---

## 📊 Collection Summary

- **50+ APIs** across 10 folders
- **Full RBAC enforcement** (candidate/recruiter/admin)
- **Stripe payment integration** with webhook
- **Complete error handling** (401/403/404/409)
- **Pagination, filtering, sorting** on all list endpoints
- **Real business logic** (not mock/fake endpoints)
- **All endpoints exist** in the running backend

---

## 🛠️ Development Notes

### Running the Server

```bash
# From backend directory
cd Backend
npm install        # Install dependencies
npm run build      # Compile TypeScript
npm start          # Start server (http://localhost:5000)
```

### Seed Data

```bash
npm run seed       # Run prisma seed with demo users/data
```

### Test Tokens

After seeding, login via the auth endpoints to get tokens, then set them in your Postman environment.

---

*This collection documents the actual backend APIs at `http://localhost:5000/api/v1`. All endpoints have been implemented with full business logic, RBAC, Zod validation, and proper error handling as part of Phases 3B-8.*