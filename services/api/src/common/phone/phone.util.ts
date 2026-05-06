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

export function normalizePhoneToE164(input: string): string {
  const raw = input.trim();
  if (!raw) {
    throw phoneInvalidException();
  }

  const withInternationalPrefix = raw.startsWith('00')
    ? `+${raw.slice(2)}`
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
