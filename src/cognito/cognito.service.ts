import { Injectable } from '@nestjs/common';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  CreateUserPoolCommand,
  ListUserPoolsCommand
} from '@aws-sdk/client-cognito-identity-provider';
import { AppConfigService } from '../config/config.service';
const pLimit = require('p-limit');


@Injectable()
export class CognitoService {
  private client: CognitoIdentityProviderClient;
  private limit = pLimit(10); // 10 concurrent requests

  constructor(private config: AppConfigService) {
    this.client = new CognitoIdentityProviderClient({
      region: this.config.cognitoRegion,
      credentials: {
        accessKeyId: this.config.awsAccessKeyId,
        secretAccessKey: this.config.awsSecretAccessKey,
      },
    });
  }

  async getUserPools(): Promise<any[]> {
    const command = new ListUserPoolsCommand({ MaxResults: 10 });
    const response = await this.client.send(command);
    return response.UserPools || [];
  }

  async createUserPool(poolName: string): Promise<void> {
    const command = new CreateUserPoolCommand({
      PoolName: poolName,
      AutoVerifiedAttributes: ['email'],
      Policies: {
        PasswordPolicy: {
          MinimumLength: 8,
          RequireUppercase: true,
          RequireLowercase: true,
          RequireNumbers: true,
          RequireSymbols: true,
        },
      },
      AdminCreateUserConfig: {
        AllowAdminCreateUserOnly: true,
      },
    });
  
    try {
      const response = await this.client.send(command);
      console.log(`User pool '${poolName}' created with ID: ${response.UserPool?.Id}`);
    } catch (error) {
      console.error(`Error creating user pool: ${error.message}`);
      throw error;
    }
  }

  async createUser(username: string, email: string): Promise<void> {
    return this.limit(async () => {
      const command = new AdminCreateUserCommand({
        UserPoolId: this.config.cognitoUserPoolId,
        Username: username,
        UserAttributes: [{ Name: 'email', Value: email }],
        TemporaryPassword: 'Test@123!',
        MessageAction: 'SUPPRESS',
      });

      try {
        await this.client.send(command);
        console.log(`User ${username} created successfully.`);
      } catch (error) {
        console.error(`Error creating user ${username}: ${error.message}`);
      }
    });
  }

  async deleteUser(username: string): Promise<void> {
    return this.limit(async () => {
      const command = new AdminDeleteUserCommand({
        UserPoolId: this.config.cognitoUserPoolId,
        Username: username,
      });

      try {
        await this.client.send(command);
        console.log(`User ${username} deleted successfully.`);
      } catch (error) {
        console.error(`Error deleting user ${username}: ${error.message}`);
      }
    });
  }
}
