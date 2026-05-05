import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClientAuthService } from './client-auth.service';
import { ClientDevTokenDto } from './dto/client-dev-token.dto';

@ApiTags('client-auth')
@Controller('client/auth')
export class ClientAuthController {
  constructor(private readonly clientAuth: ClientAuthService) {}

  @Get('providers')
  @ApiOperation({ summary: 'OAuth providers (placeholder)' })
  providers() {
    return {
      data: [
        { id: 'google', name: 'Google', configured: false },
        { id: 'facebook', name: 'Facebook', configured: false },
      ],
    };
  }

  @Get('oauth/:provider/start')
  @ApiOperation({ summary: 'OAuth start URL (not implemented)' })
  oauthStart(@Param('provider') provider: string): never {
    throw new HttpException(
      {
        statusCode: HttpStatus.NOT_IMPLEMENTED,
        message: `OAuth start for "${provider}" is not implemented yet. See /docs/API_CONTRACT.md §3.`,
        error: 'Not Implemented',
        code: 'OAUTH_NOT_CONFIGURED',
      },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  @Post('logout')
  @ApiOperation({ summary: 'Client logout (not implemented)' })
  clientLogout(): never {
    throw new HttpException(
      {
        statusCode: HttpStatus.NOT_IMPLEMENTED,
        message:
          'Client session logout is not implemented yet. See /docs/API_CONTRACT.md §3.',
        error: 'Not Implemented',
        code: 'CLIENT_AUTH_NOT_CONFIGURED',
      },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  @Post('dev/token')
  @ApiOperation({
    summary:
      'Mint a client JWT for local testing (no OAuth). Disabled in production unless CLIENT_DEV_AUTH_ENABLED=true.',
  })
  devToken(@Body() body: ClientDevTokenDto) {
    return this.clientAuth.mintDevToken(body);
  }

  @Post('oauth/:provider/callback')
  @ApiOperation({ summary: 'OAuth callback (not implemented)' })
  oauthCallback(@Param('provider') provider: string): never {
    throw new HttpException(
      {
        statusCode: HttpStatus.NOT_IMPLEMENTED,
        message: `OAuth callback for "${provider}" is not implemented yet. See /docs/API_CONTRACT.md §3.`,
        error: 'Not Implemented',
        code: 'OAUTH_NOT_CONFIGURED',
      },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }
}
