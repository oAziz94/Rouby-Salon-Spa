import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('meta')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('smoke')
  @ApiOperation({ summary: 'Sprint 0 connectivity check' })
  getSmoke(): { ok: boolean; service: string; version: string } {
    return this.appService.getSmokePayload();
  }
}
