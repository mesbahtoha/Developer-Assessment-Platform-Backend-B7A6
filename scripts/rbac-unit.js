// Unit test for RBAC middlewares (run: node scripts/rbac-unit.js after npm run build)
const { requireAdmin, requireRecruiter, requireCandidate, authorize } = require('../dist/middlewares/rbac');
const { ApiError } = require('../dist/shared/ApiError');

let pass = 0;
let fail = 0;

function run(middleware, user) {
  const req = { user };
  let calledNext = false;
  let capturedError = null;
  middleware(req, {}, (e) => {
    calledNext = true;
    capturedError = e;
  });
  return { calledNext, capturedError };
}

function check(name, condition) {
  if (condition) { console.log('PASS  ' + name); pass++; }
  else { console.log('FAIL  ' + name); fail++; }
}

const candidate = { id: 'u1', email: 'c@t.com', role: 'CANDIDATE' };
const recruiter = { id: 'u2', email: 'r@t.com', role: 'RECRUITER' };
const admin = { id: 'u3', email: 'a@t.com', role: 'ADMIN' };

let r = run(requireAdmin, admin);
check('requireAdmin passes for ADMIN', r.calledNext && r.capturedError === undefined);

r = run(requireAdmin, candidate);
check('requireAdmin rejects CANDIDATE with 403', r.calledNext && r.capturedError instanceof ApiError && r.capturedError.statusCode === 403);

r = run(requireAdmin, recruiter);
check('requireAdmin rejects RECRUITER with 403', r.calledNext && r.capturedError instanceof ApiError && r.capturedError.statusCode === 403);

r = run(requireRecruiter, recruiter);
check('requireRecruiter passes for RECRUITER', r.calledNext && r.capturedError === undefined);

r = run(requireRecruiter, candidate);
check('requireRecruiter rejects CANDIDATE with 403', r.calledNext && r.capturedError instanceof ApiError && r.capturedError.statusCode === 403);

r = run(requireCandidate, candidate);
check('requireCandidate passes for CANDIDATE', r.calledNext && r.capturedError === undefined);

r = run(requireCandidate, admin);
check('requireCandidate rejects ADMIN with 403', r.calledNext && r.capturedError instanceof ApiError && r.capturedError.statusCode === 403);

r = run(requireAdmin, undefined);
check('missing user -> 401 unauthorized', r.calledNext && r.capturedError instanceof ApiError && r.capturedError.statusCode === 401);

r = run(authorize('CANDIDATE', 'RECRUITER'), recruiter);
check('authorize(multi-role) passes', r.calledNext && r.capturedError === undefined);

console.log('-----------------------------------');
console.log('RBAC RESULT: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
