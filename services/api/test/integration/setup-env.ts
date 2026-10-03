/** Runs in every test worker before any module import: point Prisma at the test database. */
const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error('TEST_DATABASE_URL is not set.');
}
process.env.DATABASE_URL = url;
process.env.DIRECT_URL = url;
process.env.NODE_ENV = 'test';
process.env.NOTIFICATIONS_ENABLED = 'false';
process.env.OTP_PROVIDER = 'dummy';
process.env.WAPILOT_API_TOKEN = '';
process.env.SLOT_AUTOGEN_ENABLED = 'false';
process.env.JWT_SECRET =
  process.env.JWT_SECRET ??
  'integration-jwt-secret-do-not-use-in-production-32+';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '30m';
