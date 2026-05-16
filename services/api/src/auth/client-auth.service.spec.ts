import { HttpException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ClientOtpPurpose } from '@prisma/client';
import { ClientAuthService } from './client-auth.service';
import type { OtpProvider } from './otp/otp-provider.interface';

describe('ClientAuthService OTP', () => {
  const phone = '+201001234567';
  const now = new Date('2026-05-16T12:00:00.000Z');

  function buildService(args: {
    env?: Record<string, string>;
    otpDelivery?: OtpProvider;
    prisma?: Record<string, unknown>;
  }): ClientAuthService {
    const env: Record<string, string> = {
      OTP_PROVIDER: 'dummy',
      OTP_ENABLED: 'true',
      NODE_ENV: 'development',
      CLIENT_OTP_TTL_SECONDS: '300',
      CLIENT_OTP_MAX_ATTEMPTS: '5',
      CLIENT_OTP_REQUEST_COOLDOWN_SECONDS: '60',
      OTP_CODE_SECRET: 'test-secret',
      CLIENT_JWT_EXPIRES_IN: '8h',
      OTP_DUMMY_EXPOSE_CODE: 'true',
      ...args.env,
    };
    const config = {
      get: jest.fn(
        (key: string, defaultValue?: string): string | undefined =>
          env[key] ?? defaultValue,
      ),
    } as unknown as ConfigService;
    const prisma = {
      client: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
      clientOtpCode: {
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'otp-1' }),
        update: jest.fn(),
      },
      ...args.prisma,
    };
    const jwtService = {
      signAsync: jest.fn().mockResolvedValue('jwt-token'),
    } as unknown as JwtService;
    const otpDelivery = args.otpDelivery ?? { sendOtp: jest.fn() };
    return new ClientAuthService(
      prisma as never,
      jwtService,
      config,
      otpDelivery,
    );
  }

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns devCode for dummy provider in development', async () => {
    const sendOtp = jest.fn().mockResolvedValue(undefined);
    const service = buildService({ otpDelivery: { sendOtp } });
    const res = await service.requestOtp('01001234567');
    expect(res.devCode).toMatch(/^\d{6}$/);
    expect(sendOtp).toHaveBeenCalled();
  });

  it('does not return devCode in production', async () => {
    const service = buildService({
      env: { NODE_ENV: 'production', OTP_PROVIDER: 'dummy' },
    });
    const res = await service.requestOtp('01001234567');
    expect(res.devCode).toBeUndefined();
  });

  it('does not return devCode when provider is whatsapp', async () => {
    const service = buildService({
      env: { OTP_PROVIDER: 'whatsapp' },
      otpDelivery: { sendOtp: jest.fn().mockResolvedValue(undefined) },
    });
    const res = await service.requestOtp('01001234567');
    expect(res.devCode).toBeUndefined();
  });

  it('enforces resend cooldown', async () => {
    const service = buildService({
      prisma: {
        client: { findUnique: jest.fn().mockResolvedValue(null) },
        clientOtpCode: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'recent',
            createdAt: new Date(now.getTime() - 30_000),
          }),
          create: jest.fn(),
        },
      },
    });
    await expect(service.requestOtp('01001234567')).rejects.toBeInstanceOf(
      HttpException,
    );
  });

  it('rejects verification after max attempts', async () => {
    const service = buildService({
      prisma: {
        clientOtpCode: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'otp-1',
            phone,
            codeHash: 'hash',
            expiresAt: new Date(now.getTime() + 60_000),
            attempts: 5,
            purpose: ClientOtpPurpose.LOGIN,
          }),
          update: jest.fn(),
        },
      },
    });
    await expect(service.verifyOtp(phone, '123456')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
