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
    const raw = this.configService.get<string>('COOKIE_EXPIRY_HOURS');
    const parsed = raw !== undefined ? Number(raw) : undefined;
    return Number.isFinite(parsed) && (parsed as number) > 0 ? (parsed as number) : 48;
  }

  // --- Application-specific HTTP config ---
  get cognitoUrl(): string {
    return this.configService.get<string>('COGNITO_URL');
  }

  get appLoginUrl(): string {
    const raw = this.configService.get<string>('APP_LOGIN_URL');
    return raw?.trim();
  }

  get appReferer(): string {
    const raw = this.configService.get<string>('APP_REFERRER');
    return raw?.replace(/['"]/g, '').trim();
  }

  get cognitoTimeoutMs(): number {
    return this.configService.get<number>('COGNITO_TIMEOUT_MS') ?? 5000;
  }

  get cognitoRetries(): number {
    return this.configService.get<number>('COGNITO_RETRIES') ?? 2;
  }

  get appTimeoutMs(): number {
    return this.configService.get<number>('APP_TIMEOUT_MS') ?? 10000;
  }

  get appMaxConcurrent(): number {
    return this.configService.get<number>('APP_MAX_CONCURRENT') ?? 10;
  }

  get appRetries(): number {
    return this.configService.get<number>('APP_RETRIES') ?? 2;
  }
}
