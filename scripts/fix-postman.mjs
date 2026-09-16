import fs from 'node:fs';

const p = 'POSTMAN.json';
let text = fs.readFileSync(p, 'utf8');
// Strip /* ... */ comment lines (Postman collections must be pure JSON)
text = text
  .split('\n')
  .filter((l) => !l.includes('/*') && !l.includes('*/'))
  .join('\n');
const col = JSON.parse(text);

const ensureVar = (key, value, desc) => {
  if (!col.variable.find((v) => v.key === key)) {
    col.variable.push({ key, value, type: 'string', description: desc });
  }
};
ensureVar('assessmentId', '', 'Assessment UUID for payment/attempt flows');
ensureVar('problemId', '', 'Problem UUID');
ensureVar('invitationId', '', 'Invitation UUID');
ensureVar('attemptId', '', 'Attempt UUID');
ensureVar('submissionId', '', 'Submission UUID');
ensureVar('paymentId', '', 'Payment UUID');
ensureVar('sessionId', '', 'Stripe checkout session id (cs_test_...)');

const findFolder = (name) => col.item.find((f) => f.name === name);
const authHeader = (v) => [
  { key: 'Content-Type', value: 'application/json' },
  { key: 'Authorization', value: `Bearer {{${v}}}` },
];
const bearerOnly = (v) => [{ key: 'Authorization', value: `Bearer {{${v}}}` }];
const urlOf = (raw, ...path) => ({ raw, host: ['{{baseUrl}}'], path });

// --- Fix admin bodies to match Zod schemas ---
const users = findFolder('Users');
for (const r of users.item) {
  if (r.name === 'Admin: Update User Status') {
    r.request.body = { mode: 'raw', raw: '{\n  "isActive": true\n}' };
    r.request.description =
      'ADMIN only. Body must be { "isActive": boolean }. Deactivates via soft-delete flags.';
  }
  if (r.name === 'Admin: Update User Role') {
    r.request.body = { mode: 'raw', raw: '{\n  "role": "RECRUITER"\n}' };
    r.request.description =
      'ADMIN only. Body must be { "role": "CANDIDATE" | "RECRUITER" | "ADMIN" }. Cannot change own role.';
  }
}
// --- Add missing admin requests ---
const adminReq = (name, method, raw, path, query) => ({
  name,
  request: {
    method,
    header: bearerOnly('adminToken'),
    ...(query ? { query } : {}),
    url: urlOf(raw, ...path),
  },
});
for (const r of [
  adminReq('Admin: List Payments', 'GET', '{{baseUrl}}/admin/payments', ['admin', 'payments']),
  adminReq('Admin: List Assessments', 'GET', '{{baseUrl}}/admin/assessments', ['admin', 'assessments']),
  adminReq(
    'Admin: List Audit Logs',
    'GET',
    '{{baseUrl}}/admin/audit-logs?action=PAYMENT_INITIATED',
    ['admin', 'audit-logs'],
    [{ key: 'action', value: 'PAYMENT_INITIATED', description: 'Filter by action' }]
  ),
]) {
  if (!users.item.find((x) => x.name === r.name)) users.item.push(r);
}

// --- Payments folder fixes ---
const pay = findFolder('Payments');
for (const r of pay.item) {
  if (r.name === 'Create Checkout Session') {
    r.request.header = authHeader('candidateToken');
    r.request.body = {
      mode: 'raw',
      raw: '{\n  "assessmentId": "{{assessmentId}}",\n  "amountInCents": 999\n}',
    };
    r.request.description =
      'Any authenticated role (typically CANDIDATE paying for own attempt). Zod: assessmentId UUID, amountInCents int >= 50. Returns { url, sessionId, payment }. Pay at `url` with test card 4242 4242 4242 4242.';
  }
  if (r.name === 'Stripe Webhook') {
    r.request.description =
      'PUBLIC (no Bearer token). Stripe signs the raw body; server verifies signature via STRIPE_WEBHOOK_SECRET. Test with: stripe listen --forward-to localhost:5000/api/v1/payments/webhook. Marks payment PAID/FAILED idempotently.';
  }
  if (r.name === 'Get Payment by ID') {
    r.request.header = bearerOnly('candidateToken');
    r.request.url = urlOf('{{baseUrl}}/payments/:id', 'payments', ':id');
    r.request.description = 'Owner or ADMIN only (403 otherwise).';
  }
  if (r.name === 'Get My Payments') {
    r.request.header = bearerOnly('candidateToken');
    r.request.description = 'Lists current user payments with assessment titles.';
  }
}
if (!pay.item.find((x) => x.name === 'Verify Checkout Session')) {
  pay.item.splice(2, 0, {
    name: 'Verify Checkout Session',
    request: {
      method: 'GET',
      header: bearerOnly('candidateToken'),
      url: urlOf('{{baseUrl}}/payments/verify/:sessionId', 'payments', 'verify', ':sessionId'),
      description:
        'Server-side Stripe retrieve + reconcile. Marks PAID if Stripe says paid. Use after returning from Checkout success_url.',
    },
  });
}

fs.writeFileSync(p, JSON.stringify(col, null, 2) + '\n');
let folders = col.item.length;
let reqs = 0;
for (const f of col.item) reqs += (f.item || []).length;
console.log(`OK folders=${folders} requests=${reqs}`);
