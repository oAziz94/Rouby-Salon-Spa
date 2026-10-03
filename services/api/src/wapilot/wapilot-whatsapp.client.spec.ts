import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WapilotWhatsAppClient } from './wapilot-whatsapp.client';
import { WapilotConfigService } from './wapilot-config.service';

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

  function client(onlyTo?: string): WapilotWhatsAppClient {
    const config = {
      get: jest.fn((key: string) =>
        key === 'WHATSAPP_ONLY_TO' ? onlyTo : undefined,
      ),
      getOrThrow: jest.fn((key: string) => {
        if (key === 'WAPILOT_INSTANCE_ID') return 'inst-1';
        if (key === 'WAPILOT_API_TOKEN') return 'secret-token';
        throw new Error(`missing ${key}`);
      }),
    } as unknown as ConfigService;
    const wapilotConfig = {
      getApiBaseUrl: () => 'https://api.wapilot.net/api/v2',
    } as WapilotConfigService;
    return new WapilotWhatsAppClient(config, wapilotConfig);
  }

  it('posts send-message with expected shape via sendTextMessage', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    await client().sendTextMessage('201001234567', 'hello');

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

  it('with WHATSAPP_ONLY_TO set, sends only to the listed numbers', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    const c = client('+20 100 151 9873');
    await c.sendTextMessage('201001234567', 'to a real client');
    expect(fetchMock).not.toHaveBeenCalled();
    await c.sendTextMessage('201001519873', 'to the tester');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not include message body secrets in error logs on failure', async () => {
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
      c.sendTextMessage('201001234567', '654321'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    const logged = errorSpy.mock.calls.flat().join(' ');
    expect(logged).not.toContain('654321');
    expect(logged).not.toContain('secret-token');
    expect(logged).toContain('…4567');
  });
});
