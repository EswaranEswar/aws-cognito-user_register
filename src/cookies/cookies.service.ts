import {
  Injectable,
  HttpException,
  HttpStatus,
  OnModuleInit,
} from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';
import { UserRepository } from '../users/user.repository';
import { AppConfigService } from '../config/config.service';
import * as https from 'https';

const validateConfig = (appConfigService: AppConfigService) => {
  const missingVars = [];
  if (!appConfigService.cognitoUrl) missingVars.push('COGNITO_URL');
  if (!appConfigService.appLoginUrl) missingVars.push('APP_LOGIN_URL');
  if (!appConfigService.appReferer) missingVars.push('APP_REFERRER');
  
  if (missingVars.length > 0) {
    console.error('Missing required environment variables:', missingVars.join(', '));
    console.error('Please set these variables in your .env file or docker-compose.yml');
    return false;
  }
  
  console.log('All required environment variables are set');
  console.log('Configuration:', {
    cognitoUrl: appConfigService.cognitoUrl,
    appLoginUrl: appConfigService.appLoginUrl,
    appReferer: appConfigService.appReferer,
  });
  return true;
};

@Injectable()
export class GetCookiesService implements OnModuleInit {
  private cognitoClient: AxiosInstance;

  constructor(
    private readonly userRepository: UserRepository,
    private readonly appConfigService: AppConfigService,
  ) {}

  onModuleInit() {
    if (!validateConfig(this.appConfigService)) {
      return;
    }
    
    const httpsAgent = new https.Agent({
      keepAlive: true,
      maxSockets: this.appConfigService.appMaxConcurrent * 2,
      timeout: this.appConfigService.appTimeoutMs,
    });

    this.cognitoClient = axios.create({
      timeout: this.appConfigService.cognitoTimeoutMs,
      httpsAgent,
    });
  }

  private async retryOperation<T>(
    operation: () => Promise<T>,
    retries: number,
  ): Promise<T> {
    let lastError: any;
    for (let i = 0; i <= retries; i++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (i === retries) break;
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, i) * 1000),
        );
      }
    }
    throw lastError;
  }

  private async processUser(
    user: any,
  ): Promise<{ email: string; cookie?: string; error?: string }> {
    try {
      const cognitoResponse = await this.retryOperation(async () => {
        return this.cognitoClient.post(this.appConfigService.cognitoUrl, {
          email: user.email,
          password: user.password,
        });
      }, this.appConfigService.cognitoRetries);
      const accessToken = cognitoResponse.data.accessToken;
      // console.log('=============>Cognito access token for', user.email, ':', accessToken);
      if (!accessToken) {
        return { email: user.email, error: 'No access token received' };
      }

      const jar = new CookieJar();
      const client = wrapper(
        axios.create({
          jar,
          withCredentials: true,
          timeout: this.appConfigService.appTimeoutMs,
          validateStatus: () => true,
          maxRedirects: 5,
          headers: {
            Connection: 'keep-alive',
            'Keep-Alive': 'timeout=5, max=1000',
          },
        }),
      );

      const appResponse = await this.retryOperation(async () => {
        return client.get(this.appConfigService.appLoginUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Referer: this.appConfigService.appReferer,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          }
        });
      }, this.appConfigService.appRetries);

      console.log('App login response', {
        status: appResponse.status,
        setCookie: appResponse.headers?.['set-cookie'],
        dataPreview:
          typeof appResponse.data === 'string'
            ? appResponse.data.slice(0, 300)
            : appResponse.data,
      });

      if (appResponse.status >= 400) {
        return {
          email: user.email,
          error: `App login failed with status ${appResponse.status}`,
        };
      }

      const setCookieHeaders = appResponse.headers['set-cookie'];
      if (setCookieHeaders) {
        const connectSidHeader = setCookieHeaders.find((c) =>
          c.startsWith('connect.sid='),
        );
        if (connectSidHeader) {
          const sidValue = connectSidHeader.split(';')[0].split('=')[1];
          await this.userRepository.updateUserCookies(
            user.email,
            sidValue,
            this.appConfigService.cookieExpiryHours,
          );
          console.log(`User ${user.email} logged, cookies generated`);
          return { email: user.email, cookie: sidValue };
        }
      }

      const cookies = jar.getCookiesSync(this.appConfigService.appLoginUrl);
      const connectSidCookie = cookies.find((c) => c.key === 'connect.sid');

      if (connectSidCookie) {
        await this.userRepository.updateUserCookies(
          user.email,
          connectSidCookie.value,
          this.appConfigService.cookieExpiryHours,
        );
        console.log(`User ${user.email} logged, cookies generated`);
        return { email: user.email, cookie: connectSidCookie.value };
      }

      return { email: user.email, error: 'No connect.sid cookie found' };
    } catch (err) {
      return {
        email: user.email,
        error: err.response?.data?.message || err.message || 'Unknown error',
      };
    }
  }

  async fetchAllCookies(): Promise<{ cookies: { 'connect.sid': string }[] }> {
    try {
      if (!validateConfig(this.appConfigService)) {
        return { cookies: [] };
      }

      const usersNeedingCookies =
        await this.userRepository.getUsersNeedingCookies();

      if (usersNeedingCookies.length === 0) {
        return { cookies: [] };
      }

      const results: { 'connect.sid': string }[] = [];

      for (const user of usersNeedingCookies) {
        const result = await this.processUser(user);
        if (result.cookie) {
          results.push({ 'connect.sid': result.cookie });
        }
      }

      return { cookies: results };
    } catch (err) {
      throw new HttpException(
        'Failed to fetch cookies',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async generateCookiesForUser(email: string, password: string): Promise<{ cookie?: string; error?: string }> {
    try {
      if (!validateConfig(this.appConfigService)) {
        return { error: 'Missing required environment variables' };
      }

      const user = { email, password };
      const result = await this.processUser(user);

      if (result.cookie) {
        return { cookie: result.cookie };
      } else {
        return { error: result.error };
      }
    } catch (err) {
      return { error: err.response?.data?.message || err.message || 'Unknown error' };
    }
  }
}
