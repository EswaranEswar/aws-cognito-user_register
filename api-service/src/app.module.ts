import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppConfigService } from './config/config.service';
import { UsersModule } from './users/users.module';
import { CookiesModule } from './cookies/cookies.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRootAsync({
      useFactory: (configService: AppConfigService) => ({
        uri: configService.mongoUrl,
      }),
      inject: [AppConfigService],
    }),
    UsersModule,
    CookiesModule,
  ],
  providers: [AppConfigService],
})
export class AppModule {} 