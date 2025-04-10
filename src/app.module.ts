import { Module } from '@nestjs/common';
import { CognitoModule } from './cognito/cognito.module';
import { UsersModule } from './users/users.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule.forRoot({
    isGlobal: true
  }), 
    CognitoModule, 
    UsersModule
  ],
})
export class AppModule {}
