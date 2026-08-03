import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000' });
  const port = parseInt(process.env.PORT ?? '4000', 10);
  await app.listen(port);
  console.log(`API running on http://localhost:${port}`);
}
bootstrap();
