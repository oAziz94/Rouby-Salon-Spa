import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ClientAuthService } from './client-auth.service';
import { ClientOtpRequestDto } from './dto/client-otp-request.dto';
import { ClientOtpVerifyDto } from './dto/client-otp-verify.dto';
import { ClientJwtAuthGuard } from './guards/client-jwt-auth.guard';

@ApiTags('client-auth')
@Controller('client/auth')
export class ClientAuthController {
  constructor(private readonly clientAuth: ClientAuthService) {}

  @Post('otp/request')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Request OTP code for client phone login',
  })
  requestOtp(@Body() body: ClientOtpRequestDto) {
    return this.clientAuth.requestOtp(body.phone);
  }

  @Post('otp/verify')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Verify OTP code and return client JWT (aud=client)',
  })
  verifyOtp(@Body() body: ClientOtpVerifyDto) {
    return this.clientAuth.verifyOtp(body.phone, body.code);
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(ClientJwtAuthGuard)
  @ApiBearerAuth('client-jwt')
  @ApiOperation({
    summary:
      'Client logout (MVP stateless): client clears local token after success',
  })
  clientLogout(): void {
    return this.clientAuth.logout();
  }

  @Get('providers')
  @ApiOperation({
    summary: 'OAuth providers (deferred; phone OTP is active auth method)',
  })
  providers() {
    return {
      data: [
        { id: 'google', name: 'Google', configured: false },
        { id: 'facebook', name: 'Facebook', configured: false },
      ],
      mode: 'otp_phone',
    };
  }
}
