import { BadRequestException, Injectable } from '@nestjs/common';
import { normalizePhoneToWhatsAppChatId } from '../common/phone/phone.util';
import { WapilotWhatsAppClient } from '../wapilot/wapilot-whatsapp.client';
import {
  buildAppointmentReminderMessage,
  buildBookingCancellationMessage,
  buildBookingConfirmationMessage,
  buildChangeRequestApprovedMessage,
  buildChangeRequestRejectedMessage,
} from './booking-notification-messages';
import type {
  AppointmentReminderPayload,
  BookingCancellationPayload,
  BookingConfirmationPayload,
  ChangeRequestApprovedPayload,
  ChangeRequestRejectedPayload,
} from './booking-notification.types';
import type { WhatsAppNotificationProvider } from './whatsapp-notification-provider.interface';

@Injectable()
export class WapilotWhatsAppNotificationProvider implements WhatsAppNotificationProvider {
  constructor(private readonly wapilot: WapilotWhatsAppClient) {}

  async sendBookingConfirmation(
    payload: BookingConfirmationPayload,
  ): Promise<void> {
    const chatId = this.resolveChatId(payload.clientPhoneE164);
    const text = buildBookingConfirmationMessage(payload);
    await this.wapilot.sendTextMessage(chatId, text);
  }

  async sendAppointmentReminder(
    payload: AppointmentReminderPayload,
  ): Promise<void> {
    const chatId = this.resolveChatId(payload.clientPhoneE164);
    const text = buildAppointmentReminderMessage(payload);
    await this.wapilot.sendTextMessage(chatId, text);
  }

  async sendBookingCancellation(
    payload: BookingCancellationPayload,
  ): Promise<void> {
    const chatId = this.resolveChatId(payload.clientPhoneE164);
    const text = buildBookingCancellationMessage(payload);
    await this.wapilot.sendTextMessage(chatId, text);
  }

  async sendChangeRequestUpdate(
    payload: ChangeRequestApprovedPayload | ChangeRequestRejectedPayload,
    outcome: 'approved' | 'rejected',
  ): Promise<void> {
    const chatId = this.resolveChatId(payload.clientPhoneE164);
    const text =
      outcome === 'approved'
        ? buildChangeRequestApprovedMessage(
            payload as ChangeRequestApprovedPayload,
          )
        : buildChangeRequestRejectedMessage(payload);
    await this.wapilot.sendTextMessage(chatId, text);
  }

  private resolveChatId(phoneE164: string): string {
    try {
      return normalizePhoneToWhatsAppChatId(phoneE164);
    } catch {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Invalid client phone number for WhatsApp delivery.',
        error: 'Bad Request',
        code: 'PHONE_INVALID',
      });
    }
  }
}
