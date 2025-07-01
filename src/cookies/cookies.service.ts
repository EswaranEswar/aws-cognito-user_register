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

const config = {
  cognito: {
    url: process.env.COGNITO_URL,
    timeout: 5000,
    retries: 2,
  },
  app: {
    loginUrl: process.env.APP_LOGIN_URL?.trim(),
    referer: process.env.APP_REFERRER?.replace(/['"]/g, '').trim(),
    timeout: 10000,
    maxConcurrent: 10,
    retries: 2,
  },
};

// Validate required environment variables
const validateConfig = () => {
  const missingVars = [];
  if (!config.cognito.url) missingVars.push('COGNITO_URL');
  if (!config.app.loginUrl) missingVars.push('APP_LOGIN_URL');
  if (!config.app.referer) missingVars.push('APP_REFERRER');
  
  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingVars.join(', '));
    console.error('Please set these variables in your .env file or docker-compose.yml');
    return false;
  }
  
  console.log('✅ All required environment variables are set');
  console.log('🔧 Configuration:', {
    cognitoUrl: config.cognito.url,
    appLoginUrl: config.app.loginUrl,
    appReferer: config.app.referer,
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
    // Validate environment variables first
    if (!validateConfig()) {
      console.error('🚨 Cookie service initialization failed due to missing environment variables');
      return;
    }
    
    // Initialize Cognito client with connection pooling
    const httpsAgent = new https.Agent({
      keepAlive: true,
      maxSockets: config.app.maxConcurrent * 2,
      timeout: config.app.timeout,
    });

    this.cognitoClient = axios.create({
      timeout: config.cognito.timeout,
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
    password: string,
  ): Promise<{ email: string; cookie?: string; error?: string }> {
    try {
      // Get Cognito token with retry
      const cognitoResponse = await this.retryOperation(async () => {
        return this.cognitoClient.post(config.cognito.url, {
          email: user.email,
          password: password,
        });
      }, config.cognito.retries);

      const accessToken = cognitoResponse.data.accessToken;
      if (!accessToken) {
        return { email: user.email, error: 'No access token received' };
      }

      // Setup cookie jar for this request
      const jar = new CookieJar();
      const client = wrapper(
        axios.create({
          jar,
          withCredentials: true,
          timeout: config.app.timeout,
          validateStatus: () => true,
          maxRedirects: 5,
          headers: {
            Connection: 'keep-alive',
            'Keep-Alive': 'timeout=5, max=1000',
          },
        }),
      );

      // Call app login with retry
      const appResponse = await this.retryOperation(async () => {
        return client.get(config.app.loginUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Referer: config.app.referer,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
        });
      }, config.app.retries);

      if (appResponse.status >= 400) {
        return {
          email: user.email,
          error: `App login failed with status ${appResponse.status}`,
        };
      }

      // Fast path: Check headers first
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
          return { email: user.email, cookie: sidValue };
        }
      }

      // Fallback: Check cookie jar
      const cookies = jar.getCookiesSync(config.app.loginUrl);
      const connectSidCookie = cookies.find((c) => c.key === 'connect.sid');

      if (connectSidCookie) {
        await this.userRepository.updateUserCookies(
          user.email,
          connectSidCookie.value,
          this.appConfigService.cookieExpiryHours,
        );
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

  private async processBatch(users: any[], password: string): Promise<any[]> {
    return Promise.all(users.map((user) => this.processUser(user, password)));
  }

  async fetchAllCookies(password: string): Promise<{ cookies: { 'connect.sid': string }[] }> {
    try {
      // Validate configuration before proceeding
      if (!validateConfig()) {
        console.error('❌ Cannot generate cookies: Missing required environment variables');
        return { cookies: [] };
      }
      
      console.log('Starting to process users who need cookies');

      // Get only users who need cookies (no cookies or expired cookies)
      const usersNeedingCookies =
        await this.userRepository.getUsersNeedingCookies();
      console.log(`Found ${usersNeedingCookies.length} users needing cookies`);

      if (usersNeedingCookies.length === 0) {
        console.log('No users need cookies at this time');
        return { cookies: [] };
      }

      // Log details about users needing cookies
      usersNeedingCookies.forEach((user) => {
        const reason = !user.cookies ? 'No cookies' : 'Expired cookies';
        console.log(`User ${user.email} needs cookies: ${reason}`);
      });

      const results: { 'connect.sid': string }[] = [];
      const errors: { email: string; error: string }[] = [];

      // Process users in batches with progress tracking
      const totalBatches = Math.ceil(
        usersNeedingCookies.length / config.app.maxConcurrent,
      );
      for (
        let i = 0;
        i < usersNeedingCookies.length;
        i += config.app.maxConcurrent
      ) {
        const batchNumber = Math.floor(i / config.app.maxConcurrent) + 1;
        const batch = usersNeedingCookies.slice(
          i,
          i + config.app.maxConcurrent,
        );

        console.log(`Processing batch ${batchNumber}/${totalBatches}`);
        const batchResults = await this.processBatch(batch, password);

        batchResults.forEach((result) => {
          if (result.cookie) {
            results.push({ 'connect.sid': result.cookie });
          } else if (result.error) {
            errors.push({ email: result.email, error: result.error });
          }
        });

        console.log(
          `Completed batch ${batchNumber}/${totalBatches} (${Math.round((batchNumber / totalBatches) * 100)}%)`,
        );
      }

      if (errors.length > 0) {
        console.error(`Errors occurred (${errors.length}):`, errors);
      }

      console.log(
        `Process completed. Success: ${results.length}, Errors: ${errors.length}`,
      );
      return { cookies: results };
    } catch (err) {
      console.error('Fatal error in fetchAllCookies:', err);
      throw new HttpException(
        'Failed to fetch cookies',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
