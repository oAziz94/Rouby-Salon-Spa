import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import { ClientAuthController } from './client-auth.controller';
import { ClientAuthService } from './client-auth.service';
import { DashboardAuthController } from './dashboard-auth.controller';
import { DashboardAuthService } from './dashboard-auth.service';
import { DashboardInternalController } from './dashboard-internal.controller';
import { ClientJwtStrategy } from './strategies/client-jwt.strategy';
import { DashboardJwtStrategy } from './strategies/dashboard-jwt.strategy';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60_000,
          limit: 10_000,
        },
      ],
    }),
  ],
  controllers: [
    DashboardAuthController,
    ClientAuthController,
    DashboardInternalController,
  ],
  providers: [
    DashboardAuthService,
    DashboardJwtStrategy,
    ClientJwtStrategy,
    ClientAuthService,
  ],
  exports: [
    JwtModule,
    DashboardAuthService,
    ClientAuthService,
    DashboardJwtStrategy,
    ClientJwtStrategy,
  ],
})
export class AuthModule {}
