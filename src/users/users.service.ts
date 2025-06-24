import { Injectable, Logger } from '@nestjs/common';
import { CognitoService } from '../cognito/cognito.service';
import { UserGeneratorService } from '../common/user-generator.service';
import { UserRepository } from './user.repository';
import { AppConfigService } from '../config/config.service';

export type User = {
  name: string;
  email: string;
};

@Injectable()
export class UsersService {
  private logger = new Logger(UsersService.name);

  constructor(
    private cognitoService: CognitoService,
    private userGenerator: UserGeneratorService,
    private userRepository: UserRepository,
    private appConfigService: AppConfigService,
  ) {}

  async createFakerUsers(count: number, password: string) {
    const users = this.userGenerator.generateFakeUsers(count, password);

    const createdUsers = await Promise.all(
      users.map(async (user) => {
        try {
          await this.cognitoService.createUser(user.name, user.email, password);
          await this.userRepository.createUser(user.name, user.email, password);
          console.log('User created successfully in database for login');
          return user;
        } catch (error) {
          this.logger.error(
            `User creation failed for ${user.email}: ${error.message}`,
          );
          return null;
        }
      }),
    );

    return createdUsers.filter((user) => user !== null);
  }

  async loginUser(email: string, password: string) {
    try {
      const result = await this.cognitoService.loginUser(email, password);

      // Update user with cookies and get updated user
      const updatedUser = await this.userRepository.updateUserCookies(
        email,
        result.sessionToken,
        this.appConfigService.cookieExpiryHours,
      );

      return {
        message: 'User logged in successfully',
        accessToken: result.accessToken,
        user: updatedUser,
      };
    } catch (error) {
      throw new Error(`Login failed for ${email}: ${error.message}`);
    }
  }

  async deleteMultipleUsers(emails: string[]): Promise<void> {
    await Promise.all(
      emails.map(async (email) => {
        await this.cognitoService.deleteUser(email);
      }),
    );
  }

  async getCookies(input: string) {
    return await this.userRepository.getCookies(input);
  }
}
