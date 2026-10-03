import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const logger = new Logger('HTTP');
const SLOW_MS = 1500;
const JSON_LOGS = process.env.NODE_ENV === 'production';

/**
 * One line per request that deserves attention: every 4xx/5xx and anything slower than
 * SLOW_MS. Healthy fast traffic stays quiet so the Render log is readable. In production the
 * Nest logger is in JSON mode, so each line is a searchable record with the request id.
 */
export function requestLogMiddleware(
  req: Request & { requestId?: string; user?: { userId?: string } },
  res: Response,
  next: NextFunction,
): void {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1_000_000;
    const status = res.statusCode;
    if (status < 400 && ms < SLOW_MS) return;
    const path = (req.originalUrl ?? req.url).split('?')[0];
    const record = {
      method: req.method,
      path,
      status,
      ms: Math.round(ms),
      requestId: req.requestId ?? null,
      userId: req.user?.userId ?? null,
      slow: ms >= SLOW_MS,
    };
    // One line either way: Nest's JSON mode keeps the fields; plain mode gets a compact string.
    const line = JSON_LOGS ? record : JSON.stringify(record);
    if (status >= 500) logger.error(line);
    else logger.warn(line);
  });
  next();
}
