# Postman Collection Guide

## Overview
This document describes the Postman collection for the Developer Assessment Platform Backend API.

## Base URL
```
https://developerassessmentbackend.vercel.app
```

## Authentication
All protected endpoints require a Bearer token. Obtain it from the **Authentication** folder:

1. **Login** - `/api/auth/login` (POST)
   - Body: `{"email": "...", "password": "..."}`
   - Returns `accessToken` and `refreshToken`

2. **Google OAuth** - `/api/auth/google` (POST)
   - Body: `{"idToken": "..."}`

3. **Refresh Token** - `/api/auth/refresh` (POST)
   - Body: `{"refreshToken": "..."}`

4. **Logout** - `/api/auth/logout` (POST)
   - Body: `{"refreshToken": "..."}`

## Roles & Permissions

| Role | Can Access |
|------|-----------|
| **Candidate** | Own profile, assessments, attempts, submissions, results, leaderboard |
| **Recruiter** | Create assessments, invite candidates, view results, reports |
| **Admin** | Full access to all user management, audit logs, system settings |

## Collection Structure

### Authentication
- Login (email/password)
- Google OAuth
- Refresh Token
- Logout

### User Management (Admin only)
- Get All Users
- Get User by ID
- Update User
- Delete User (soft delete)
- Ban User
- Unblock User

### Candidate
- Get Profile
- Update Profile

### Recruiter
- Get Profile
- Update Profile

### Admin
- Get Profile
- Update Profile

### Problems (Public + Authenticated)
- Get All Problems
- Get Problem by ID
- Create Problem (Recruiter/Admin)
- Update Problem (Owner/Admin)
- Delete Problem (Owner/Admin)

### Assessments
- Get All Assessments
- Get Assessment by ID
- Create Assessment (Recruiter/Admin)
- Update Assessment (Owner/Admin)
- Delete Assessment (Owner/Admin)
- Add Problem to Assessment
- Remove Problem from Assessment

### Invitations
- Send Invitation (Recruiter)
- Get My Invitations (Candidate)
- Accept Invitation
- Decline Invitation
- Get Assessment Invitations (Recruiter)

### Attempts
- Start Attempt
- Get My Attempts
- Get Attempt by ID
- Submit Attempt
- Save Draft

### Submissions
- Get Submission by ID
- Evaluate MCQ (Auto)
- Evaluate Code (Manual - Admin/Recruiter)

### Results
- Get My Results
- Get Result by ID
- Get Assessment Results (Recruiter/Admin)

### Reports
- Get Dashboard Stats (Admin)
- Get Platform Analytics (Admin)
- Get Candidate Report

### Leaderboard
- Get Leaderboard
- Get Assessment Leaderboard

### Payments
- Create Payment Intent
- Confirm Payment
- Get Payment Status

### Admin APIs
- Get Audit Logs
- Get System Settings
- Update System Settings

### Health
- Health Check

## Environment Variables
Set these in Postman environment:

| Variable | Value |
|----------|-------|
| `baseUrl` | `https://developerassessmentbackend.vercel.app` |
| `accessToken` | (set dynamically from login) |
| `refreshToken` | (set dynamically from login) |
| `userId` | (set dynamically from login) |
| `assessmentId` | (set dynamically from assessment creation) |
| `attemptId` | (set dynamically from attempt start) |
| `submissionId` | (set dynamically from submission) |

## Testing Workflow
1. Run **Authentication** → Login to get tokens
2. Run **Health** → verify API is up
3. Run **Problems** → test problem CRUD
4. Run **Assessments** → test assessment lifecycle
5. Run **Invitations** → test invitation flow
6. Run **Attempts** → test attempt creation and timing
7. Run **Submissions** → test MCQ auto-eval and code manual-eval
8. Run **Results** → test results retrieval
9. Run **Payments** → test Stripe payment flow
10. Run **Admin** → test admin-only endpoints
11. Run **Reports** → test analytics
12. Run **Leaderboard** → test leaderboard

## Error Codes
| Code | Meaning |
|------|---------|
| 401 | Unauthorized - Invalid or missing token |
| 402 | Payment Required - Assessment not paid |
| 403 | Forbidden - Insufficient role |
| 404 | Not Found - Resource doesn't exist |
| 409 | Conflict - Resource already exists |
| 422 | Validation Error - Invalid input |
| 500 | Internal Server Error |

## Soft Delete
All delete operations perform soft delete (set `deletedAt` timestamp) rather than permanent deletion.