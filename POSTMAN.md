# 🚀 Developer Assessment Platform API

> **Production API:** `https://developerassessmentbackend.vercel.app/api/v1`

A complete REST API for a **Developer Assessment Platform** supporting authentication, role-based user management, coding/MCQ problems, assessments, invitations, attempts, submissions, evaluation, reporting, and Stripe payments.

The included Postman collection contains **50+ meaningful API endpoints** with full business logic, RBAC authorization, validation, error handling, pagination, filtering, and payment integration.

---

## 📌 API Overview

| Feature                      | Supported            |
| ---------------------------- | -------------------- |
| 🔐 Authentication            | ✅ JWT + Google OAuth |
| 👥 User Management           | ✅                    |
| 🧩 Problem Bank              | ✅ MCQ + Coding       |
| 📝 Assessments               | ✅                    |
| 📩 Invitations               | ✅                    |
| ⏱️ Assessment Attempts       | ✅                    |
| 📤 Submissions               | ✅                    |
| 🧑‍💻 Manual Evaluation      | ✅                    |
| 📊 Results & Reports         | ✅                    |
| 💳 Stripe Payments           | ✅                    |
| 🔒 Role-Based Access Control | ✅                    |
| ✅ Zod Validation             | ✅                    |
| 📄 Pagination & Filtering    | ✅                    |
| ⚠️ Error Handling            | ✅                    |
| 🧪 Postman Collection        | ✅ 50+ endpoints      |

### Supported Roles

* **ADMIN** — Platform administration and reporting
* **RECRUITER** — Create assessments, manage problems, invite candidates, and evaluate submissions
* **CANDIDATE** — Accept invitations, purchase assessments, take assessments, submit answers, and view results

---

# 📦 Postman Collection

The repository includes a ready-to-import Postman collection:

```text
POSTMAN.json
```

Import the collection into Postman to test the complete API workflow.

### Collection Structure

```text
Developer Assessment Platform API
│
├── 🔐 Authentication
├── 👥 Users
├── 🧩 Problems
├── 📝 Assessments
├── 📩 Invitations
├── ⏱️ Attempts
├── 📤 Submissions
├── 🧑‍💻 Evaluation
├── 💳 Payments
└── ⚠️ Error Responses
```

---

# 🌐 Base URL

```text
https://developerassessmentbackend.vercel.app/api/v1
```

For local development:

```text
http://localhost:5000/api/v1
```

---

# 🔧 Postman Environment

Create a Postman environment named:

```text
DeveloperAssessment
```

Then configure the following variables:

| Variable         | Type   | Description              | Default                                                |
| ---------------- | ------ | ------------------------ | ------------------------------------------------------ |
| `baseUrl`        | String | API base URL             | `https://developerassessmentbackend.vercel.app/api/v1` |
| `accessToken`    | String | General JWT access token | Empty                                                  |
| `refreshToken`   | String | JWT refresh token        | Empty                                                  |
| `adminToken`     | String | Admin access token       | Empty                                                  |
| `recruiterToken` | String | Recruiter access token   | Empty                                                  |
| `candidateToken` | String | Candidate access token   | Empty                                                  |

### Configure Environment

1. Open **Postman**
2. Open the **Environment** dropdown
3. Select **Manage Environments**
4. Create a new environment named `DeveloperAssessment`
5. Add the variables above
6. Select the environment before testing the API

---

# 👤 Demo Credentials

The following accounts are available from the seed data:

| Role          | Email                           | Password         |
| ------------- | ------------------------------- | ---------------- |
| **Admin**     | `admin@assessment.com`          | `Admin@1234`     |
| **Recruiter** | `recruiter@assessment.com`      | `Recruiter@1234` |
| **Candidate** | `candidate@assessment.com`      | `Candidate@1234` |
| **Candidate** | `jane.candidate@assessment.com` | `Jane@1234`      |

> ⚠️ These credentials are intended for development/testing purposes only.

---

# 🔐 Authentication

The API uses **JWT-based authentication** with access and refresh tokens.

## Login Flow

### 1. Login

```http
POST /auth/login
```

Example:

```json
{
  "email": "admin@assessment.com",
  "password": "Admin@1234"
}
```

Successful response:

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "user": {}
}
```

Repeat the login process for recruiter and candidate accounts.

---

## 2. Set Authorization

Protected endpoints require:

```http
Authorization: Bearer <access-token>
```

In Postman, role-specific requests use:

```text
{{adminToken}}
{{recruiterToken}}
{{candidateToken}}
```

depending on the endpoint.

---

## 3. Refresh Token

```http
POST /auth/refresh-token
```

Use the current refresh token to obtain a new access token.

---

# 📚 API Reference

## 🔐 1. Authentication

| Method | Endpoint                | Auth          | Description                 |
| ------ | ----------------------- | ------------- | --------------------------- |
| POST   | `/auth/register`        | ❌             | Register a new user         |
| POST   | `/auth/login`           | ❌             | Login and obtain JWT tokens |
| POST   | `/auth/google`          | ❌             | Google OAuth authentication |
| POST   | `/auth/refresh-token`   | Refresh Token | Rotate access token         |
| POST   | `/auth/logout`          | Access Token  | Revoke refresh token        |
| GET    | `/auth/me`              | Access Token  | Get current user            |
| PATCH  | `/auth/change-password` | Access Token  | Change password             |

---

## 👥 2. Users

| Method | Endpoint                  | Auth  | Description                          |
| ------ | ------------------------- | ----- | ------------------------------------ |
| GET    | `/users/me`               | User  | Get current profile                  |
| PATCH  | `/users/me`               | User  | Update name/avatar                   |
| GET    | `/admin/users`            | Admin | List users with pagination/filtering |
| GET    | `/admin/users/search`     | Admin | Search users by name/email           |
| PATCH  | `/admin/users/:id/status` | Admin | Change user active/deleted status    |
| PATCH  | `/admin/users/:id/role`   | Admin | Change Candidate ↔ Recruiter role    |

---

## 🧩 3. Problems

The problem bank supports both **MCQ** and **coding problems**.

| Method | Endpoint           | Auth          | Description             |
| ------ | ------------------ | ------------- | ----------------------- |
| POST   | `/problems`        | Recruiter     | Create MCQ/CODE problem |
| GET    | `/problems`        | Authenticated | List/filter problems    |
| GET    | `/problems/search` | Authenticated | Search problems         |
| GET    | `/problems/:id`    | Authenticated | Get problem details     |
| PATCH  | `/problems/:id`    | Recruiter     | Update problem          |
| DELETE | `/problems/:id`    | Recruiter     | Soft-delete problem     |

Supported filtering includes:

* Problem type
* Difficulty
* Search query
* Pagination
* Sorting

---

## 📝 4. Assessments

| Method | Endpoint                           | Auth      | Description                |
| ------ | ---------------------------------- | --------- | -------------------------- |
| POST   | `/assessments`                     | Recruiter | Create assessment          |
| GET    | `/assessments`                     | Candidate | List published assessments |
| GET    | `/assessments/:id`                 | Candidate | Get assessment             |
| POST   | `/assessments/:assessmentId/start` | Candidate | Start assessment           |
| PATCH  | `/assessments/:id`                 | Admin     | Update assessment          |
| DELETE | `/assessments/:id`                 | Admin     | Soft-delete assessment     |
| POST   | `/assessments/:id/problems`        | Recruiter | Attach problems            |

> Candidates only see assessments that are available to them according to the platform's invitation/payment rules.

---

## 📩 5. Invitations

Recruiters can invite candidates to assessments.

| Method | Endpoint                  | Auth            | Description                |
| ------ | ------------------------- | --------------- | -------------------------- |
| POST   | `/invitations`            | Recruiter       | Send assessment invitation |
| GET    | `/invitations`            | Candidate       | View received invitations  |
| GET    | `/invitations`            | Recruiter/Admin | View sent invitations      |
| PATCH  | `/invitations/:id/accept` | Candidate       | Accept invitation          |
| PATCH  | `/invitations/:id/reject` | Candidate       | Reject invitation          |

---

## ⏱️ 6. Attempts

| Method | Endpoint                           | Auth      | Description              |
| ------ | ---------------------------------- | --------- | ------------------------ |
| POST   | `/assessments/:assessmentId/start` | Candidate | Start an attempt         |
| GET    | `/attempts/:id`                    | Candidate | Get attempt details      |
| PATCH  | `/attempts/:id/submit`             | Candidate | Submit attempt           |
| GET    | `/attempts/:attemptId/submissions` | Candidate | List attempt submissions |
| POST   | `/attempts/:attemptId/submissions` | Candidate | Submit answer            |

The attempt submission process automatically calculates the applicable result based on the implemented evaluation rules.

---

## 📤 7. Submissions

| Method | Endpoint           | Auth       | Description             |
| ------ | ------------------ | ---------- | ----------------------- |
| GET    | `/submissions/:id` | Role-based | View submission details |

Access depends on the user's role:

* **Candidate** → Sanitized submission information
* **Recruiter/Admin** → Full submission information where authorized

---

## 🧑‍💻 8. Evaluation

| Method | Endpoint                               | Auth      | Description                     |
| ------ | -------------------------------------- | --------- | ------------------------------- |
| GET    | `/evaluation/results/me`               | Candidate | View personal results           |
| GET    | `/evaluation/submissions/pending`      | Recruiter | View pending manual evaluations |
| PATCH  | `/evaluation/submissions/:id/evaluate` | Recruiter | Manually evaluate submission    |
| GET    | `/evaluation/assessments/:id/results`  | Recruiter | Assessment statistics           |
| GET    | `/evaluation/assessments/:id/report`   | Admin     | Generate full assessment report |

---

# 💳 9. Payments

The platform integrates with **Stripe Checkout** for paid assessments.

| Method | Endpoint                | Auth          | Description                    |
| ------ | ----------------------- | ------------- | ------------------------------ |
| POST   | `/payments/create`      | Recruiter     | Create Stripe Checkout Session |
| POST   | `/payments/webhook`     | Stripe        | Process Stripe webhook events  |
| GET    | `/payments/:id`         | Recruiter     | Get payment details            |
| GET    | `/payments/my-payments` | Authenticated | Get user's payment history     |

> The webhook endpoint does **not** use JWT authentication because requests originate from Stripe.

---

# 💰 Stripe Payment Flow

The payment flow works as follows:

```text
Recruiter
    │
    ▼
Create Paid Assessment
    │
    ▼
Candidate Attempts to Start
    │
    ▼
Payment Required (402)
    │
    ▼
Create Stripe Checkout Session
    │
    ▼
Stripe Checkout
    │
    ▼
Test Payment
    │
    ▼
Stripe Webhook
    │
    ▼
Payment → PAID
    │
    ▼
Candidate Starts Assessment
```

---

## 🧪 Stripe Test Mode

Use **Stripe Test Mode** during development.

### Successful Payment

```text
4242 4242 4242 4242
```

### Declined Payment

```text
4000 0025 0000 3155
```

Use any future expiration date and any valid test CVC/ZIP when required by Stripe Checkout.

---

# 💳 Payment Testing Workflow

### Step 1 — Create a Paid Assessment

A recruiter creates an assessment with a non-zero price.

Example:

```json
{
  "assessmentId": "...",
  "amountInCents": 999
}
```

`999` cents = `$9.99`.

---

### Step 2 — Candidate Attempts to Start

```http
POST /assessments/:assessmentId/start
```

If payment is required but has not been completed, the API returns:

```http
402 Payment Required
```

---

### Step 3 — Create Checkout Session

```http
POST /payments/create
```

Example:

```json
{
  "assessmentId": "...",
  "amountInCents": 999
}
```

The API returns a Stripe Checkout URL and payment information.

---

### Step 4 — Complete Payment

Open the returned Checkout URL and use:

```text
4242 4242 4242 4242
```

---

### Step 5 — Stripe Webhook

Stripe sends the payment event to:

```http
POST /payments/webhook
```

The backend processes the event and updates the payment status.

---

### Step 6 — Payment Becomes PAID

The payment record is updated:

```text
PENDING → PAID
```

---

### Step 7 — Start Assessment

The candidate can now call:

```http
POST /assessments/:assessmentId/start
```

and proceed with the assessment.

---

# 🔔 Stripe Webhook — Local Development

For local webhook testing, Stripe CLI can forward events to the backend.

```bash
stripe listen --forward-to localhost:5000/api/v1/payments/webhook
```

The Stripe CLI will provide a webhook signing secret for local development.

> Production webhook events should be configured in the Stripe Dashboard using the deployed API endpoint.

---

# 🔒 Authorization & RBAC

The API implements role-based access control for:

```text
ADMIN
RECRUITER
CANDIDATE
```

### RBAC Examples

| Endpoint                                     | Required Role  | Unauthorized Role      |
| -------------------------------------------- | -------------- | ---------------------- |
| `GET /admin/*`                               | ADMIN          | 403                    |
| `POST /assessments/:id/start`                | CANDIDATE      | 403                    |
| `POST /invitations`                          | RECRUITER      | 403                    |
| `PATCH /invitations/:id/accept`              | CANDIDATE      | 403                    |
| `GET /evaluation/submissions/pending`        | RECRUITER      | 403                    |
| `PATCH /evaluation/submissions/:id/evaluate` | RECRUITER      | 403                    |
| `GET /evaluation/assessments/:id/report`     | ADMIN          | 403                    |
| `/payments/*`                                | Role-dependent | 403 where unauthorized |

---

# ⚠️ Error Handling

The API provides structured error responses for common failure scenarios.

| Status | Meaning                            |
| ------ | ---------------------------------- |
| `400`  | Invalid request / validation error |
| `401`  | Missing or invalid authentication  |
| `402`  | Payment required                   |
| `403`  | Insufficient permissions           |
| `404`  | Resource not found                 |
| `409`  | Resource conflict                  |
| `500`  | Internal server error              |

### Common `401` Cases

* Missing token
* Invalid token
* Expired token
* Deactivated account

### Common `403` Cases

* Wrong user role
* Accessing another user's resource
* Unauthorized recruiter/assessment access
* Unauthorized submission access

### Common `404` Cases

* Invalid resource ID
* Resource does not exist
* Candidate not invited to assessment

---

# 📥 Import Postman Collection

### Step 1

Download:

```text
POSTMAN.json
```

from the repository.

### Step 2

Open **Postman**.

### Step 3

Click:

```text
Import
```

### Step 4

Select:

```text
POSTMAN.json
```

### Step 5

Create/select the environment:

```text
DeveloperAssessment
```

### Step 6

Configure the environment variables.

### Step 7

Login using one of the demo accounts and save the returned tokens.

### Step 8

Start testing the API workflow.

---

# 🔄 Recommended Testing Order

For a complete end-to-end test, follow this sequence:

```text
1. Register / Login
        ↓
2. Obtain JWT Tokens
        ↓
3. Create Problems
        ↓
4. Create Assessment
        ↓
5. Attach Problems
        ↓
6. Publish Assessment
        ↓
7. Invite Candidate
        ↓
8. Candidate Accepts Invitation
        ↓
9. Create Payment / Checkout
        ↓
10. Complete Stripe Payment
        ↓
11. Stripe Webhook
        ↓
12. Start Assessment
        ↓
13. Submit Answers
        ↓
14. Submit Attempt
        ↓
15. Manual Evaluation (if required)
        ↓
16. View Results
        ↓
17. Generate Assessment Report
```

---

# 🛠️ Local Development

## Prerequisites

Make sure the following are installed:

* Node.js
* npm
* PostgreSQL
* Stripe CLI *(for local webhook testing)*
* Postman

---

## Install Dependencies

From the backend directory:

```bash
cd Backend
npm install
```

---

## Build Project

```bash
npm run build
```

---

## Start Server

```bash
npm start
```

The local API will be available at:

```text
http://localhost:5000
```

Therefore the local API base URL is:

```text
http://localhost:5000/api/v1
```

---

# 🌱 Seed Database

To populate the database with development/test data:

```bash
npm run seed
```

This creates the demo users and required sample data.

After seeding, use the demo login credentials to obtain JWT tokens.

---

# 🧱 API Architecture

The platform is built around several major modules:

```text
Authentication
     │
     ├── JWT
     ├── Refresh Tokens
     └── Google OAuth
     
Users
     │
     ├── Admin
     ├── Recruiter
     └── Candidate

Assessment System
     │
     ├── Problems
     ├── Assessments
     ├── Invitations
     ├── Attempts
     └── Submissions

Evaluation
     │
     ├── Automatic Evaluation
     ├── Manual Evaluation
     ├── Results
     └── Reports

Payments
     │
     ├── Stripe Checkout
     ├── Webhooks
     └── Payment History
```

---

# ✨ Key Features

### 🔐 Secure Authentication

* JWT access tokens
* Refresh token rotation
* Google authentication
* Password management
* Logout/token revocation

### 👥 Role-Based Access Control

* Admin
* Recruiter
* Candidate
* Protected role-specific routes

### 🧩 Problem Management

* MCQ problems
* Coding problems
* Difficulty levels
* Search and filtering
* Soft deletion

### 📝 Assessment Management

* Assessment creation
* Problem attachment
* Publishing workflow
* Candidate attempts
* Invitation-based access
* Paid assessments

### 📊 Evaluation

* Automatic result calculation
* Manual submission evaluation
* Candidate result history
* Assessment statistics
* Administrative reports

### 💳 Payments

* Stripe Checkout
* Payment records
* Webhook verification/processing
* Payment status management
* Payment history

### ⚙️ API Quality

* Zod request validation
* Consistent error handling
* Pagination
* Filtering
* Sorting
* RBAC enforcement
* Meaningful HTTP status codes

---

# 📊 Collection Summary

| Metric           | Details                       |
| ---------------- | ----------------------------- |
| API Endpoints    | **50+**                       |
| API Modules      | **10**                        |
| Authentication   | JWT + Google OAuth            |
| Roles            | Admin / Recruiter / Candidate |
| Assessment Types | MCQ / Coding                  |
| Payment Provider | Stripe                        |
| Validation       | Zod                           |
| Database         | PostgreSQL                    |
| API Style        | REST                          |
| Deployment       | Vercel                        |
| Testing          | Postman                       |

---

# 🌐 Production API

**Live Backend:**

```text
https://developerassessmentbackend.vercel.app/api/v1
```

The production backend contains the implemented API modules and business logic documented above.

---

## 📌 Notes

* Use **Stripe Test Mode** for payment testing.
* Never expose production secrets or JWT tokens publicly.
* The demo credentials are intended only for development/testing.
* Protected endpoints require an appropriate JWT access token.
* Role restrictions are enforced server-side.
* Stripe webhook requests are handled separately from normal JWT-authenticated requests.

---

# 🚀 Developer Assessment Platform

A full-featured backend platform designed to manage the complete developer assessment lifecycle:

```text
Recruiter
   ↓
Create Problems
   ↓
Create Assessment
   ↓
Invite Candidate
   ↓
Candidate Accepts
   ↓
Payment
   ↓
Assessment Attempt
   ↓
Submission
   ↓
Evaluation
   ↓
Results
   ↓
Assessment Report
```

**50+ REST APIs • JWT Authentication • RBAC • Assessments • Evaluation • Stripe Payments • Production Deployment**
