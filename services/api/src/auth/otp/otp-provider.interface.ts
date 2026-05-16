export interface OtpProvider {
  sendOtp(phone: string, otp: string, context?: string): Promise<void>;
}

export const OTP_DELIVERY = Symbol('OTP_DELIVERY');
