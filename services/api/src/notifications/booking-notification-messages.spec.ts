import {
  buildAppointmentReminderMessage,
  buildBookingConfirmationMessage,
  buildBookingCancellationMessage,
  buildBookingRejectedMessage,
  buildBookingRequestReceivedMessage,
  buildBookingRescheduledMessage,
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

  it('builds booking request received copy', () => {
    const text = buildBookingRequestReceivedMessage(base);
    expect(text).toContain('booking request');
    expect(text).toContain('review your request');
  });

  it('builds booking rejected copy', () => {
    const text = buildBookingRejectedMessage(base);
    expect(text).toContain('could not confirm');
    expect(text).toContain('book a new appointment');
  });

  it('builds cancellation copy', () => {
    const text = buildBookingCancellationMessage(base);
    expect(text).toContain('cancelled');
    expect(text).toContain('Sunday, 17 May');
    expect(text).toContain('book a new appointment');
  });

  it('builds 24h reminder without "tomorrow"', () => {
    const text = buildAppointmentReminderMessage({
      ...base,
      reminderVariant: '24h',
    });
    expect(text).toContain('friendly reminder');
    expect(text).not.toContain('tomorrow');
  });

  it('builds 90m reminder with configurable lead time', () => {
    const text = buildAppointmentReminderMessage({
      ...base,
      reminderVariant: '90m',
      minutesBeforeFinal: 60,
    });
    expect(text).toContain('about 1 hour');
    expect(text).not.toContain('90 minutes');
  });

  it('builds booking rescheduled copy', () => {
    const text = buildBookingRescheduledMessage({
      ...base,
      newDateLabel: 'Monday, 18 May',
      newTimeLabel: '7:00 PM',
    });
    expect(text).toContain('rescheduled');
    expect(text).toContain('Monday, 18 May');
    expect(text).toContain('7:00 PM');
  });

  it('builds change request approved copy as reschedule', () => {
    const text = buildChangeRequestApprovedMessage({
      ...base,
      changeRequestId: 'cr1',
      newDateLabel: 'Monday, 18 May',
      newTimeLabel: '7:00 PM',
    });
    expect(text).toContain('rescheduled');
    expect(text).not.toContain('approved');
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
