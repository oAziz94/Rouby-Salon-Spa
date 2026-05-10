export enum ClientOtpRequestIntent {
  /** Legacy: booking flow — request without existence checks; verify may create client. */
  LOGIN = 'LOGIN',
  SIGN_IN = 'SIGN_IN',
  REGISTER = 'REGISTER',
}
