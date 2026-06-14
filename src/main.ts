import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  dotenv.config();
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.enableCors({
    origin: [
      'https://yourdomain.com',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ], // آدرس فرانت
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: 'Content-Type,Authorization',
    credentials: true, // اگر کوکی ارسال می‌شود
  });
  const config = new DocumentBuilder()
    .setTitle('Sugaro API Docs')
    .setDescription('مستندات هوشمند سامانه‌ی پیشنهادها و کاربران')
    .setVersion('1.0')
    .addBearerAuth() // برای JWT
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);
  // await app.listen(process.env.PORT ?? 5000);
  // await app.listen(process.env.PORT ?? 5000, process.env.HOST ?? '127.0.0.1');
  await app.listen(5000, '0.0.0.0');
}
bootstrap();
