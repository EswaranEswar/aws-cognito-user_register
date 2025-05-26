import { Injectable, Logger } from '@nestjs/common';
import { CognitoService } from '../cognito/cognito.service';
import { generateUsersFromBase } from './users.utils';
import { UserGeneratorService } from './user-generator.service';

export type User = {
  name: string;
  email: string;
};

@Injectable()
export class UsersService {
  private logger = new Logger(UsersService.name);
  constructor(
    private cognitoService: CognitoService,
    private userGenerator: UserGeneratorService
  ) { }

  async createUser(name: string, email: string, password: string): Promise<void> {
    await this.cognitoService.createUser(name, email, password);
  }

  async createFakerUsers(count: number, password: string) {
    const users = this.userGenerator.generateFakeUsers(count, password);
    
    await Promise.all(users.map(async (user) => {
      try {
        await this.cognitoService.createUser(
          user.name,
          user.email,
          user.password
        );
      } catch (error) {
        this.logger.error(`User creation failed for ${user.email}: ${error.message}`);
      }
    }));
    
    return users;
  }

  //creating multiple users in increamental method
  async createMultipleUsers(name: string, email: string, count: number, userPassword:string) {
    try {
      const users = generateUsersFromBase({ name, email }, count);
      const defaultPassword = userPassword; 
  
      await Promise.all(users.map(async (user) => {
        try {
          await this.cognitoService.createUser(user.name, user.email, defaultPassword);
          console.log(`User created: ${user.name}, ${defaultPassword}`);
        } catch (error) {
          this.logger.error(`Failed to create user ${user.name}: ${error.message}`);
        }
      }));
  
      this.logger.log(`Bulk creation of ${count} users completed.`);
    } catch (error) {
      throw new Error(`Bulk registration failed: ${error.message}`);
    }
  }
  
  
  async loginUser(email: string, password: string) {
    try {
      const result = await this.cognitoService.loginUser(email, password);
      return {
        message: 'User logged in successfully',
        tokens: result,
      };
    } catch (error) {
      throw new Error(`Login failed for ${email}: ${error.message}`);
    }
  }
  


  async deleteMultipleUsers(emails: string[]): Promise<void> {
    await Promise.all(
      emails.map((email) => this.cognitoService.deleteUser(email)),
    );
  }


  async getAllUsers() {
    const users = await this.cognitoService.getAllUsers();
    return users.map((user) => ({
      username: user.Username,
      email: user.Attributes.find(attr => attr.Name === 'email')?.Value,
    }));
  }
}
