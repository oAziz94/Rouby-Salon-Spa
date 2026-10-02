import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { isSerializationFailure } from './serializable-retry';

type ErrorBody = {
  statusCode: number;
  message: string | string[];
  error?: string;
  code?: string;
  requestId: string;
  [key: string]: unknown;
};

const DB_UNREACHABLE_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017']);

/**
 * One place that shapes every error response:
 * - HttpException bodies pass through unchanged (clients rely on `code`, `overridable`, …),
 *   plus `requestId`.
 * - Prisma connectivity / serialization problems become 503 / 409 with plain-language text
 *   instead of a 500 with a stack trace.
 * - Anything else is a 500 with a generic message; the stack is logged with the request id.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { requestId?: string }>();
    const requestId = req.requestId ?? 'n/a';
    const route = `${req.method} ${req.originalUrl ?? req.url}`;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ErrorBody;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const raw = exception.getResponse();
      if (typeof raw === 'string') {
        body = { statusCode: status, message: raw, requestId };
      } else {
        body = {
          ...(raw as Record<string, unknown>),
          statusCode: status,
          message:
            (raw as { message?: string | string[] }).message ??
            exception.message,
          requestId,
        };
      }
      if (Number(status) >= 500) {
        this.logger.error(
          `${route} -> ${status} [${requestId}] ${exception.message}`,
          exception.stack,
        );
      }
    } else if (isSerializationFailure(exception)) {
      status = HttpStatus.CONFLICT;
      body = {
        statusCode: status,
        error: 'Conflict',
        code: 'TRY_AGAIN',
        message:
          'Someone else changed this at the same moment. Please try again.',
        requestId,
      };
      this.logger.warn(`${route} -> 409 TRY_AGAIN [${requestId}]`);
    } else if (
      exception instanceof Prisma.PrismaClientKnownRequestError &&
      DB_UNREACHABLE_CODES.has(exception.code)
    ) {
      status = HttpStatus.SERVICE_UNAVAILABLE;
      body = {
        statusCode: status,
        error: 'Service Unavailable',
        code: 'DATABASE_UNAVAILABLE',
        message:
          'The database is not reachable right now. Please try again in a moment.',
        requestId,
      };
      this.logger.error(
        `${route} -> 503 DATABASE_UNAVAILABLE [${requestId}] ${exception.code}: ${exception.message}`,
      );
    } else if (exception instanceof Prisma.PrismaClientInitializationError) {
      status = HttpStatus.SERVICE_UNAVAILABLE;
      body = {
        statusCode: status,
        error: 'Service Unavailable',
        code: 'DATABASE_UNAVAILABLE',
        message:
          'The database is not reachable right now. Please try again in a moment.',
        requestId,
      };
      this.logger.error(
        `${route} -> 503 DATABASE_UNAVAILABLE [${requestId}] ${exception.message}`,
      );
    } else {
      const err = exception instanceof Error ? exception : null;
      body = {
        statusCode: status,
        error: 'Internal Server Error',
        code: 'INTERNAL',
        message: `Something went wrong on our side. Please try again; if it keeps happening, quote reference ${requestId}.`,
        requestId,
      };
      this.logger.error(
        `${route} -> 500 [${requestId}] ${err?.message ?? String(exception)}`,
        err?.stack,
      );
    }

    res.status(status).json(body);
  }
}
