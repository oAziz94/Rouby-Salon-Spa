import { BadRequestException } from '@nestjs/common';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

const DEFAULT_COUNTRY = 'EG' as const;

function phoneInvalidException(): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    message: 'Invalid phone number format.',
    error: 'Bad Request',
    code: 'PHONE_INVALID',
  });
}

function stripPhoneSeparators(value: string): string {
  return value.replace(/[\s\-()]/g, '');
}

export function normalizePhoneToE164(input: string): string {
  const raw = stripPhoneSeparators(input.trim());
  if (!raw) {
    throw phoneInvalidException();
  }

  const withInternationalPrefix = raw.startsWith('00')
    ? `+${raw.slice(2)}`
    : raw.startsWith('+')
      ? raw
      : /^20\d{9,10}$/.test(raw)
        ? `+${raw}`
        : raw;

  const numericLike = withInternationalPrefix.startsWith('+')
    ? /^\+[0-9]+$/.test(withInternationalPrefix)
    : /^[0-9]+$/.test(withInternationalPrefix);
  if (!numericLike) {
    throw phoneInvalidException();
  }

  const parsed = withInternationalPrefix.startsWith('+')
    ? parsePhoneNumberFromString(withInternationalPrefix)
    : parsePhoneNumberFromString(withInternationalPrefix, DEFAULT_COUNTRY);

  if (!parsed || !parsed.isValid()) {
    throw phoneInvalidException();
  }

  return parsed.number;
}

/** International digits without "+" (e.g. `201001234567` for WAPilot `chat_id`). */
export function normalizePhoneToWhatsAppChatId(input: string): string {
  return normalizePhoneToE164(input).replace(/^\+/, '');
}
