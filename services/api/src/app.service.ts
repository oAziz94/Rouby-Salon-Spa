import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getSmokePayload(): { ok: boolean; service: string; version: string } {
    return { ok: true, service: 'api', version: '1' };
  }
}
