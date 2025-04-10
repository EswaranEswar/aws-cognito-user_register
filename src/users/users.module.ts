import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { CognitoModule } from '../cognito/cognito.module';

@Module({
  imports: [CognitoModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
