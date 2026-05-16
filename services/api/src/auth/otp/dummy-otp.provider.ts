import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OtpProvider } from './otp-provider.interface';

function maskPhoneSuffix(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 4 ? `…${digits.slice(-4)}` : '…';
}

@Injectable()
export class DummyOtpProvider implements OtpProvider {
  private readonly logger = new Logger(DummyOtpProvider.name);

  constructor(private readonly config: ConfigService) {}

  sendOtp(phone: string, _otp: string, context?: string): Promise<void> {
    const isProduction = this.config.get<string>('NODE_ENV') === 'production';
    if (isProduction) {
      return Promise.resolve();
    }
    this.logger.debug(
      `Dummy OTP provider: no message sent (${context ?? 'auth'}, phone ${maskPhoneSuffix(phone)})`,
    );
    return Promise.resolve();
  }
}
