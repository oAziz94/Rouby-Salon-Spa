import { ValidationPipe, RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';
import { resolveUploadsRoot } from './media/uploads-root';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableShutdownHooks();
  const configService = app.get(ConfigService);
  const uploadsRoot = resolveUploadsRoot(configService);
  mkdirSync(join(uploadsRoot, 'media'), { recursive: true });
  app.useStaticAssets(uploadsRoot, { prefix: '/uploads/' });

  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: 'health', method: RequestMethod.ALL }],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const originsRaw =
    configService.get<string>('CORS_ORIGIN') ??
    configService.get<string>('CORS_ORIGINS');
  const nodeEnvEarly = configService.get<string>('NODE_ENV', 'development');
  const isProdEarly = nodeEnvEarly === 'production';
  const defaultOrigins = isProdEarly
    ? []
    : ['http://localhost:3000', 'http://localhost:3001'];
  const list = originsRaw
    ? originsRaw
        .split(',')
        .map((o) => o.trim().replace(/\/+$/, ''))
        .filter(Boolean)
    : defaultOrigins;
  if (!list.length && isProdEarly) {
    throw new Error(
      'CORS_ORIGIN (or CORS_ORIGINS) must be set in production with comma-separated allowed browser origins.',
    );
  }
  app.enableCors({
    origin: list.length ? list : defaultOrigins,
    credentials: true,
  });

  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  const swaggerEnabled =
    nodeEnv !== 'production' ||
    configService.get<string>('SWAGGER_ENABLED') === 'true';

  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('Alrouby Salon API')
      .setDescription(
        'REST API (MVP). Contract: /docs/API_CONTRACT.md. Sprint 1–7: auth, RBAC, branches, settings, catalog, slots, bookings, WhatsApp, manual payments & invoices.',
      )
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'dashboard-jwt',
      )
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'client-jwt',
      )
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  const port = Number(configService.get('PORT') ?? 4000);
  await app.listen(port);
}

void bootstrap();
