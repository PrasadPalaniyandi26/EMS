import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

function validateEnv() {
  const required = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

async function bootstrap() {
  validateEnv();
  const app = await NestFactory.create(AppModule);

  // Limit JSON body size to prevent oversized payloads
  app.use(require('express').json({ limit: '1mb' }));
  app.use(require('express').urlencoded({ extended: true, limit: '1mb' }));

  // Security
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.enableCors({
    origin: [
      process.env.CLIENT_URL || 'http://localhost:3000',
      'http://localhost:3000',
    ],
    credentials: true,
  });
  app.use(cookieParser());

  // Rate limiting — tight limit on auth endpoints, general limit on all API
  app.use(
    '/api/v1/auth/login',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Too many login attempts. Try again in 15 minutes.' }),
  );
  app.use(
    '/api',
    rateLimit({ windowMs: 60 * 1000, max: 200, message: 'Too many requests. Slow down.' }),
  );

  // Global prefix for API routes
  app.setGlobalPrefix('api', {
    exclude: ['health'],
  });

  // Global pipes, interceptors, filters
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  // Swagger API docs — available at /api/docs (dev only)
  if (process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('EMS API')
      .setDescription('Expense Management System — REST API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = parseInt(process.env.PORT || '5000', 10);
  await app.listen(port);
  console.log(`🚀 EMS NestJS Server running on http://localhost:${port}`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`📖 API docs: http://localhost:${port}/api/docs`);
  }
}
bootstrap();
