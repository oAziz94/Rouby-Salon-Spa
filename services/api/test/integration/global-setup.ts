/**
 * Integration tests run against a real Postgres named by TEST_DATABASE_URL — never the
 * default DATABASE_URL, so a stray run cannot touch dev or production data.
 *
 * It must be a separate *database* (not just a schema): the API uses a few raw SQL
 * statements with unqualified table names, which follow the connection's search_path and
 * would hit `public` of whatever database the URL names. Locally, a second database on the
 * Neon dev branch works (`CREATE DATABASE rouby_test`, then the dev URL with `/rouby_test`).
 * In CI a postgres service container is used (see .github/workflows/ci.yml).
 *
 * Setup is: `prisma migrate deploy` → `prisma/seed.ts` (idempotent) with fixed test
 * passwords. Tests create their own slots/clients/bookings with unique data so the schema
 * can be reused between runs without a reset.
 */
import { spawnSync } from 'child_process';
import { resolve } from 'path';

export const TEST_PASSWORDS = {
  owner: 'TestOwner#2026',
  receptionist: 'TestFront#2026',
  staff: 'TestStaff#2026',
} as const;

export default function globalSetup(): void {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Integration tests need their own database/schema.',
    );
  }
  const dbName =
    /\/([^/?]+)(\?|$)/.exec(url.replace(/^[a-z]+:\/\/[^/]+/i, ''))?.[1] ?? '';
  const local = /localhost|127\.0\.0\.1|@postgres[:/]/.test(url);
  if (!local && !/test/i.test(dbName)) {
    throw new Error(
      `Refusing to run integration tests against database "${dbName}": TEST_DATABASE_URL must be a local database or one whose name contains "test".`,
    );
  }
  if (/schema=(?!public(&|$))/.test(url)) {
    throw new Error(
      'Refusing to run integration tests with a non-public schema: raw SQL in the API would hit the public schema of the same database.',
    );
  }
  const repoRoot = resolve(__dirname, '../../../..');
  // Neon's pooled endpoint (PgBouncer) cannot hold the advisory lock `migrate deploy`
  // takes; migrations go to the direct host, the app and seed use the URL as given.
  const directUrl = url.replace('-pooler.', '.');
  const env = {
    ...process.env,
    DATABASE_URL: url,
    DIRECT_URL: directUrl,
    NODE_ENV: 'test',
    NOTIFICATIONS_ENABLED: 'false',
    OTP_PROVIDER: 'dummy',
    WAPILOT_API_TOKEN: '',
    SLOT_AUTOGEN_ENABLED: 'false',
    JWT_SECRET:
      process.env.JWT_SECRET ??
      'integration-jwt-secret-do-not-use-in-production-32+',
    SEED_OWNER_PASSWORD: TEST_PASSWORDS.owner,
    SEED_RECEPTIONIST_PASSWORD: TEST_PASSWORDS.receptionist,
    SEED_STAFF_PASSWORD: TEST_PASSWORDS.staff,
  };
  const run = (
    label: string,
    cmd: string,
    args: string[],
    extraEnv: Record<string, string> = {},
  ) => {
    const started = Date.now();
    const r = spawnSync(cmd, args, {
      cwd: repoRoot,
      env: { ...env, ...extraEnv },
      stdio: 'pipe',
      shell: process.platform === 'win32',
      encoding: 'utf8',
    });
    if (r.status !== 0) {
      throw new Error(
        `${label} failed (exit ${r.status}):\n${r.stdout}\n${r.stderr}`,
      );
    }

    console.log(`[integration] ${label} ok in ${Date.now() - started}ms`);
  };
  run('prisma migrate deploy', 'npx', ['prisma', 'migrate', 'deploy'], {
    DATABASE_URL: directUrl,
  });
  if (process.env.INTEGRATION_SKIP_SEED !== 'true') {
    run('seed', 'npx', ['tsx', 'prisma/seed.ts']);
  }
}
