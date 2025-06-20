import { Module } from '@nestjs/common';
import { GetCookiesService } from './cookies.service';
import { DatabaseModule } from '../mongodb/database.module';
import { UserRepository } from '../users/user.repository';

@Module({
  imports: [DatabaseModule],
  providers: [GetCookiesService, UserRepository],
  exports: [GetCookiesService],
})
export class CookiesModule {} 