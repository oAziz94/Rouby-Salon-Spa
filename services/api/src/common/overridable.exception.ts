import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * SOFT rule (spec v2): the request is refused, but the same request with an
 * `overrideReason` is accepted and audited. Clients detect `overridable: true`
 * and ask the user for a reason.
 */
export function overridableException(
  code: string,
  message: string,
  extra?: Record<string, unknown>,
): HttpException {
  return new HttpException(
    {
      statusCode: HttpStatus.CONFLICT,
      message,
      error: 'Conflict',
      code,
      overridable: true,
      ...(extra ?? {}),
    },
    HttpStatus.CONFLICT,
  );
}
