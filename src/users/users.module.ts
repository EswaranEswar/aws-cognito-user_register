import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { CognitoModule } from '../cognito/cognito.module';
import { UserGeneratorService } from '../common/user-generator.service';
import { DatabaseModule } from '../mongodb/database.module';
import { UserRepository } from './user.repository';
import { CookiesModule } from '../cookies/cookies.module';

@Module({
  imports: [
    CognitoModule,
    DatabaseModule,
    CookiesModule
  ],
  controllers: [UsersController],
  providers: [
    UsersService, 
    UserGeneratorService, 
    UserRepository
  ],
})
export class UsersModule {}
