/**
 * Vercel serverless entry point.
 *
 * Vercel treats every file inside `api/` as a serverless function, and the
 * `rewrites` rule in vercel.json forwards every request (including
 * `/api/v1/*`) to this function, which hands the request straight to the
 * shared Express app. All routes, middlewares and business logic stay in
 * `src/app.ts` and remain unchanged — `src/server.ts` (app.listen) is still
 * used for local development and non-serverless hosting.
 */
import app from '../src/app';

export default app;
