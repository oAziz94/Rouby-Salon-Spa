import {
  buildBookingConfirmationMessage,
  buildBookingCancellationMessage,
  buildChangeRequestApprovedMessage,
  buildChangeRequestRejectedMessage,
} from './booking-notification-messages';

const base = {
  clientName: 'Sarah',
  clientPhoneE164: '+201001234567',
  bookingDateLabel: 'Sunday, 17 May',
  bookingTimeLabel: '6:00 PM',
  serviceNames: 'Classic Manicure, Hair Styling',
  branchName: 'AlRouby Salon',
  salonName: 'AlRouby Beauty Salon & Spa',
  supportPhone: '+20151100956',
  bookingId: 'b1',
  branchId: 'br1',
};

describe('booking notification messages', () => {
  it('builds booking confirmation copy', () => {
    const text = buildBookingConfirmationMessage(base);
    expect(text).toContain('Hello Sarah');
    expect(text).toContain('confirmed');
    expect(text).toContain('Classic Manicure, Hair Styling');
    expect(text).toContain('+20151100956');
  });

  it('builds cancellation copy', () => {
    const text = buildBookingCancellationMessage(base);
    expect(text).toContain('cancelled');
    expect(text).toContain('Sunday, 17 May');
  });

  it('builds change request approved copy with new slot', () => {
    const text = buildChangeRequestApprovedMessage({
      ...base,
      changeRequestId: 'cr1',
      newDateLabel: 'Monday, 18 May',
      newTimeLabel: '7:00 PM',
    });
    expect(text).toContain('approved');
    expect(text).toContain('Monday, 18 May');
    expect(text).toContain('7:00 PM');
  });

  it('builds change request rejected copy', () => {
    const text = buildChangeRequestRejectedMessage({
      ...base,
      changeRequestId: 'cr1',
    });
    expect(text).toContain('could not approve');
    expect(text).toContain('remains scheduled');
  });
});
