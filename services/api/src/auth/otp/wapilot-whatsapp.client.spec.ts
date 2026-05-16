import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WapilotWhatsAppClient } from './wapilot-whatsapp.client';
import { OtpConfigService } from './otp-config.service';

describe('WapilotWhatsAppClient', () => {
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  function client(): WapilotWhatsAppClient {
    const config = {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'WAPILOT_INSTANCE_ID') return 'inst-1';
        if (key === 'WAPILOT_API_TOKEN') return 'secret-token';
        throw new Error(`missing ${key}`);
      }),
    } as unknown as ConfigService;
    const otpConfig = {
      getWapilotApiBaseUrl: () => 'https://api.wapilot.net/api/v2',
    } as OtpConfigService;
    return new WapilotWhatsAppClient(config, otpConfig);
  }

  it('posts send-message with expected shape', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    await client().sendMessage('201001234567', 'hello');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.wapilot.net/api/v2/inst-1/send-message',
      expect.objectContaining({
        method: 'POST',
        headers: {
          token: 'secret-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: '201001234567',
          text: 'hello',
          priority: 1,
        }),
      }),
    );
  });

  it('does not include OTP in error logs on failure', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      text: () => Promise.resolve('upstream error'),
    });
    const c = client();
    const errorSpy = jest.spyOn(
      (c as unknown as { logger: { error: jest.Mock } }).logger,
      'error',
    );

    await expect(
      c.sendMessage('201001234567', '654321'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    const logged = errorSpy.mock.calls.flat().join(' ');
    expect(logged).not.toContain('654321');
    expect(logged).toContain('…4567');
  });
});
