import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { CognitoModule } from '../cognito/cognito.module';
import { UserGeneratorService } from './user-generator.service';

@Module({
  imports: [CognitoModule],
  controllers: [UsersController],
  providers: [UsersService, UserGeneratorService],
})
export class UsersModule {}
