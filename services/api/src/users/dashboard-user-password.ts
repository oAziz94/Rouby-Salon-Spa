import * as argon2 from 'argon2';

/** Initial password assigned to every new dashboard user until they change it. */
export const DASHBOARD_USER_INITIAL_PASSWORD = '12345678';

export async function hashDashboardInitialPassword(): Promise<string> {
  return argon2.hash(DASHBOARD_USER_INITIAL_PASSWORD, {
    type: argon2.argon2id,
  });
}

export async function passwordMatchesInitial(
  passwordHash: string,
): Promise<boolean> {
  return argon2.verify(passwordHash, DASHBOARD_USER_INITIAL_PASSWORD);
}
