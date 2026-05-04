/**
 * E2E runs with `cwd` typically `services/api`; root `.env` may omit `JWT_SECRET`
 * until developers copy `.env.example`. Provide a deterministic test secret.
 */
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET =
    'e2e-jwt-secret-do-not-use-in-production-min-32-chars';
}
