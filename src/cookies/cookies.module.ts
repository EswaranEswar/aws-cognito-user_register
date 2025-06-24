import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GetCookiesService } from './cookies.service';
import { DatabaseModule } from '../mongodb/database.module';
import { UserRepository } from '../users/user.repository';
import { AppConfigService } from '../config/config.service';

@Module({
  imports: [DatabaseModule, ConfigModule],
  providers: [GetCookiesService, UserRepository, AppConfigService],
  exports: [GetCookiesService],
})
export class CookiesModule {}
