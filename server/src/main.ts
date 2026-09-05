import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  if (
    process.env.NODE_ENV === 'production' &&
    (!process.env.JWT_SECRET ||
      process.env.JWT_SECRET === 'cambiar-esta-secreta-en-produccion')
  ) {
    throw new Error(
      'JWT_SECRET debe configurarse antes de ejecutar en producción',
    );
  }

  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:5173'],
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`API RestobarService corriendo en http://localhost:${port}/api`);
}
void bootstrap();
