import { ConfigService } from '@nestjs/config';
import { DummyOtpProvider } from './dummy-otp.provider';

describe('DummyOtpProvider', () => {
  function provider(nodeEnv: string): DummyOtpProvider {
    const config = {
      get: jest.fn((key: string) => (key === 'NODE_ENV' ? nodeEnv : undefined)),
    } as unknown as ConfigService;
    return new DummyOtpProvider(config);
  }

  it('does not log OTP digits in production', async () => {
    const p = provider('production');
    const debug = jest.spyOn(
      (p as unknown as { logger: { debug: jest.Mock } }).logger,
      'debug',
    );
    await p.sendOtp('+201001234567', '123456', 'LOGIN');
    expect(debug).not.toHaveBeenCalled();
  });

  it('logs masked delivery hint in non-production without OTP', async () => {
    const p = provider('development');
    const debug = jest.spyOn(
      (p as unknown as { logger: { debug: jest.Mock } }).logger,
      'debug',
    );
    await p.sendOtp('+201001234567', '123456', 'LOGIN');
    expect(debug).toHaveBeenCalled();
    const message = String(debug.mock.calls[0]?.[0] ?? '');
    expect(message).not.toContain('123456');
    expect(message).toContain('…4567');
  });
});
