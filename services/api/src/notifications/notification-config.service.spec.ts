import { ConfigService } from '@nestjs/config';
import { WapilotConfigService } from '../wapilot/wapilot-config.service';
import { NotificationConfigService } from './notification-config.service';

describe('NotificationConfigService', () => {
  function service(
    env: Record<string, string | undefined>,
  ): NotificationConfigService {
    const config = {
      get: jest.fn(
        (key: string, defaultValue?: string) => env[key] ?? defaultValue,
      ),
    } as unknown as ConfigService;
    return new NotificationConfigService(
      config,
      new WapilotConfigService(config),
    );
  }

  it('is disabled by default', () => {
    expect(service({}).isEnabled()).toBe(false);
  });

  it('reads reminder hours before', () => {
    expect(
      service({ BOOKING_REMINDER_HOURS_BEFORE: '12' }).getReminderHoursBefore(),
    ).toBe(12);
  });

  it('reads final reminder minutes before', () => {
    expect(
      service({ BOOKING_REMINDER_MINUTES_BEFORE_FINAL: '60' })
        .getReminderMinutesBeforeFinal(),
    ).toBe(60);
  });

  it('requires WAPilot credentials when enabled with wapilot provider', () => {
    const s = service({
      NOTIFICATIONS_ENABLED: 'true',
      WHATSAPP_PROVIDER: 'wapilot',
      WAPILOT_INSTANCE_ID: 'inst',
    });
    expect(() => s.onModuleInit()).toThrow(/WAPILOT_API_TOKEN/);
  });
});
