import { BadRequestException } from '@nestjs/common';
import { WapilotWhatsAppNotificationProvider } from './wapilot-whatsapp-notification.provider';
import type { WapilotWhatsAppClient } from '../wapilot/wapilot-whatsapp.client';

describe('WapilotWhatsAppNotificationProvider', () => {
  const sendTextMessage = jest.fn().mockResolvedValue(undefined);
  const wapilot = { sendTextMessage } as unknown as WapilotWhatsAppClient;
  const provider = new WapilotWhatsAppNotificationProvider(wapilot);

  beforeEach(() => {
    sendTextMessage.mockClear();
  });

  it('sends booking confirmation through WAPilot client', async () => {
    await provider.sendBookingConfirmation({
      bookingId: 'b1',
      branchId: 'br1',
      clientName: 'Sarah',
      clientPhoneE164: '+201001234567',
      bookingDateLabel: 'Sunday, 17 May',
      bookingTimeLabel: '6:00 PM',
      serviceNames: 'Classic Manicure',
      branchName: 'AlRouby Salon',
      salonName: 'AlRouby Beauty Salon & Spa',
      supportPhone: '+20151100956',
    });

    expect(sendTextMessage).toHaveBeenCalledWith(
      '201001234567',
      expect.stringContaining('confirmed'),
    );
  });

  it('rejects invalid phone numbers', async () => {
    await expect(
      provider.sendBookingConfirmation({
        bookingId: 'b1',
        branchId: 'br1',
        clientName: 'Sarah',
        clientPhoneE164: 'invalid',
        bookingDateLabel: 'Sunday, 17 May',
        bookingTimeLabel: '6:00 PM',
        serviceNames: 'Classic Manicure',
        salonName: 'AlRouby Beauty Salon & Spa',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(sendTextMessage).not.toHaveBeenCalled();
  });
});
