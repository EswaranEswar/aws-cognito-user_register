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
}
