import { Module } from '@nestjs/common';
import { CognitoModule } from './cognito/cognito.module';
import { UsersModule } from './users/users.module';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './mongodb/database.module';

@Module({
  imports: [
    CognitoModule,
    UsersModule,
    AppConfigModule,
    DatabaseModule
  ],
  providers: [AppService],
  controllers: [AppController],
})
export class AppModule {}
