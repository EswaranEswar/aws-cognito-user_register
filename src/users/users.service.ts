import { Injectable, Logger } from '@nestjs/common';
import { CognitoService } from '../cognito/cognito.service';
import { UserGeneratorService } from '../common/user-generator.service';
import { UserRepository } from './user.repository';
import { AppConfigService } from '../config/config.service';
import { User, UserDocument } from './schemas/user.schema';


@Injectable()
export class UsersService {
  private logger = new Logger(UsersService.name);

  constructor(
    private cognitoService: CognitoService,
    private userGenerator: UserGeneratorService,
    private userRepository: UserRepository,
    private appConfigService: AppConfigService,
  ) {}

  async createSingleUser(user: User): Promise<User>{
    try {
      // First create the user in Cognito
      await this.cognitoService.createUser(user.name, user.email, user.password);
      
      // Then store user info in MongoDB (without password)
      await this.userRepository.createUser(user);
      
      console.log(`User ${user.email} created successfully.`);
      return user;
    } catch (error) {
      throw new Error(`User creation failed for ${user.email}: ${error.message}`);
    }
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
