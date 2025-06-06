import { Module } from '@nestjs/common';
import { CognitoModule } from './cognito/cognito.module';
import { UsersModule } from './users/users.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './mongodb/database.module';
import { SocketModule } from './websocket/socket.module';

@Module({
  imports: [
    CognitoModule,
    UsersModule,
    AppConfigModule,
    DatabaseModule,
    SocketModule,
  ],
  providers: [AppService],
  controllers: [AppController],
})
export class AppModule {}
