import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfigService } from './config/config.service';
import { Logger } from '@nestjs/common';

const logger = new Logger();
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.setGlobalPrefix('api');
  const configService = app.get(AppConfigService);
  await app.listen(configService.port);
  logger.log(`🚀 Server is running on port ${configService.port}`);
}
bootstrap();



