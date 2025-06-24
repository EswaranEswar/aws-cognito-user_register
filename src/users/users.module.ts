import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { CognitoModule } from '../cognito/cognito.module';
import { UserGeneratorService } from '../common/user-generator.service';
import { DatabaseModule } from '../mongodb/database.module';
import { UserRepository } from './user.repository';
import { CookiesModule } from '../cookies/cookies.module';
import { AppConfigService } from '../config/config.service';

@Module({
  imports: [
    CognitoModule,
    DatabaseModule,
    CookiesModule,
    ConfigModule
  ],
  controllers: [UsersController],
  providers: [
    UsersService, 
    UserGeneratorService, 
    UserRepository,
    AppConfigService
  ],
})
export class UsersModule {}
