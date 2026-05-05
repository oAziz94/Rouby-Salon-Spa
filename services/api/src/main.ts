import { ValidationPipe, RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

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

  const origins = configService.get<string>('CORS_ORIGINS');
  app.enableCors({
    origin: origins
      ? origins.split(',').map((o) => o.trim())
      : ['http://localhost:3000', 'http://localhost:3001'],
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
        'REST API (MVP). Contract: /docs/API_CONTRACT.md. Sprint 1–5: auth, RBAC, branches, settings, catalog, slots, bookings.',
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
