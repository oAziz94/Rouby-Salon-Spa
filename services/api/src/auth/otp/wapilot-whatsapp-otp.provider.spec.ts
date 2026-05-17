import { ConfigService } from '@nestjs/config';
import { WapilotWhatsAppOtpProvider } from './wapilot-whatsapp-otp.provider';
import type { WapilotWhatsAppClient } from '../../wapilot/wapilot-whatsapp.client';

describe('WapilotWhatsAppOtpProvider', () => {
  it('sends professional OTP message to normalized chat_id', async () => {
    const sendTextMessage = jest.fn().mockResolvedValue(undefined);
    const wapilot = { sendTextMessage } as unknown as WapilotWhatsAppClient;
    const config = {
      get: jest.fn((key: string, defaultValue?: string) =>
        key === 'CLIENT_OTP_TTL_SECONDS' ? '300' : defaultValue,
      ),
    } as unknown as ConfigService;
    const provider = new WapilotWhatsAppOtpProvider(wapilot, config);

    await provider.sendOtp('+201001234567', '123456', 'LOGIN');

    expect(sendTextMessage).toHaveBeenCalledWith(
      '201001234567',
      'Your AlRouby verification code is: 123456. This code expires in 5 minutes. Do not share it with anyone.',
    );
  });
});
