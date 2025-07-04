import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppConfigService {
  constructor(private configService: ConfigService) {}

  get cognitoUserPoolId(): string {
    return this.configService.get<string>('USER_POOL_ID');
  }

  get cognitoRegion(): string {
    return this.configService.get<string>('AWS_REGION');
  }

  get awsAccessKeyId(): string {
    return this.configService.get<string>('AWS_ACCESS_KEY_ID');
  }

  get awsSecretAccessKey(): string {
    return this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
  }

  get cognitoClientId(): string {
    return this.configService.get<string>('COGNITO_CLIENT_ID');
  }

  get cognitoClientSecret(): string {
    return this.configService.get<string>('COGNITO_CLIENT_SECRET');
  }

  get mongoUrl(): string {
    return this.configService.get<string>('MONGODB_URI');
  }

  get port(): number {
    return this.configService.get<number>('PORT');
  }

  get cookieExpiryHours(): number {
    return this.configService.get<number>('COOKIE_EXPIRY_HOURS') || 24;
  }
}
