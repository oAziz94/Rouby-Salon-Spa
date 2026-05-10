export type OtpRequestResponse = {
  success: true;
  expiresIn: number;
  phone: string;
  devCode?: string;
};

export type OtpVerifyResponse = {
  accessToken: string;
  expiresIn: number;
  client: { id: string; fullName: string; phone: string; email: string | null };
};

export const CLIENT_OTP_INTENT = {
  SIGN_IN: "SIGN_IN",
  REGISTER: "REGISTER",
} as const;

/** Register flow: full name for OTP verify (avoid putting PII in the URL). */
export const ACCOUNT_REGISTER_FULL_NAME_KEY = "alroubyAccountRegisterFullName";

/** Booking flow: register full name between OTP request and verify. */
export const BOOKING_REGISTER_FULL_NAME_KEY = "alroubyBookingRegisterFullName";
