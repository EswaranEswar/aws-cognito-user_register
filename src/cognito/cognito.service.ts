import { Injectable, Logger } from '@nestjs/common';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  CreateUserPoolCommand,
  ListUserPoolsCommand,
  InitiateAuthCommand,
  ListUsersCommand,
  CreateUserPoolClientCommand,
  UpdateUserPoolClientCommand,
  DeleteUserPoolCommand,
  AdminSetUserPasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { AppConfigService } from '../config/config.service';
import * as crypto from 'crypto';
const pLimit = require('p-limit');

@Injectable()
export class CognitoService {
  private client: CognitoIdentityProviderClient;
  private limit = pLimit(25); // Increased from 10 to 25 for better concurrency

  constructor(private config: AppConfigService) {
    this.client = new CognitoIdentityProviderClient({
      region: this.config.cognitoRegion,
      credentials: {
        accessKeyId: this.config.awsAccessKeyId,
        secretAccessKey: this.config.awsSecretAccessKey,
      },
    });
  }

  async getAllUsers(): Promise<any[]> {
    try {
      const command = new ListUsersCommand({
        UserPoolId: this.config.cognitoUserPoolId,
      });

      const response = await this.client.send(command);
      const users = response.Users || [];

      const formattedUsers = users.map((user) => {
        const emailAttr = user.Attributes?.find(
          (attr) => attr.Name === 'email',
        );
        return {
          username: user.Username,
          email: emailAttr?.Value || 'N/A',
        };
      });

      console.log(JSON.stringify(formattedUsers, null, 2));
      return users;
    } catch (error) {
      console.error('Failed to list users:', error.message);
      throw error;
    }
  }

  async getUserPools(): Promise<any[]> {
    const command = new ListUserPoolsCommand({
      MaxResults: 10,
    });
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
      const userPoolId = response.UserPool?.Id;

      console.log(`User pool '${poolName}' created with ID: ${userPoolId}`);

      const clientCommand = new CreateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientName: `${poolName}_client`,
        GenerateSecret: false,
        ExplicitAuthFlows: [
          'ALLOW_USER_PASSWORD_AUTH',
          'ALLOW_REFRESH_TOKEN_AUTH',
          'ALLOW_ADMIN_USER_PASSWORD_AUTH',
        ],
      });

      const clientResponse = await this.client.send(clientCommand);

      console.log('App Client created:', {
        clientId: clientResponse.UserPoolClient?.ClientId,
      });
    } catch (error) {
      console.error(`Error creating user pool or app client: ${error.message}`);
      throw error;
    }
  }

  async createUser(
    name: string,
    email: string,
    password: string,
  ): Promise<void> {
    return this.limit(async () => {
      const createUserCommand = new AdminCreateUserCommand({
        UserPoolId: this.config.cognitoUserPoolId,
        Username: email,
        UserAttributes: [
          { Name: 'name', Value: name },
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
        ],
        TemporaryPassword: password,
        MessageAction: 'SUPPRESS',
      });

      try {
        await this.client.send(createUserCommand);
        console.log(`User ${name} created successfully.`);

        const setPasswordCommand = new AdminSetUserPasswordCommand({
          UserPoolId: this.config.cognitoUserPoolId,
          Username: email,
          Password: password,
          Permanent: true,
        });

        await this.client.send(setPasswordCommand);
        console.log(`Password for user ${name} set as permanent.`);
      } catch (error) {
        console.error(`Error creating user ${name}: ${error.message}`);
        throw error;
      }
    });
  }

  async loginUser(email: string, password: string) {
    let authParameters: any = {
      USERNAME: email,
      PASSWORD: password,
    };

    // Only add SECRET_HASH if client secret is configured
    if (this.config.cognitoClientSecret) {
      const secretHash = crypto
        .createHmac('sha256', this.config.cognitoClientSecret)
        .update(email + this.config.cognitoClientId)
        .digest('base64');
      authParameters.SECRET_HASH = secretHash;
    }

    const command = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: this.config.cognitoClientId,
      AuthParameters: authParameters,
    });

    try {
      const response = await this.client.send(command);

      const idToken = response.AuthenticationResult?.IdToken;
      const accessToken = response.AuthenticationResult?.AccessToken;
      const refreshToken = response.AuthenticationResult?.RefreshToken;
      const sessionToken = response.Session || null;

      return {
        result: {
          tokens: {
            idToken,
            accessToken,
            refreshToken,
          },
        },
        idToken,
        accessToken,
        refreshToken,
        sessionToken,
      };
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }

  async deleteUser(email: string): Promise<void> {
    return this.limit(async () => {
      const command = new AdminDeleteUserCommand({
        UserPoolId: this.config.cognitoUserPoolId,
        Username: email,
      });

      try {
        await this.client.send(command);
        console.log(`User ${email} deleted successfully.`);
      } catch (error) {
        console.error(`Error deleting user ${email}: ${error.message}`);
        throw error;
      }
    });
  }

  async updateUserPoolClient(): Promise<any> {
    try {
      const userPoolId = this.config.cognitoUserPoolId;
      const clientId = this.config.cognitoClientId;

      if (!userPoolId || !clientId) {
        console.error(
          'UserPoolId or ClientId is not available in the configuration.',
        );
        throw new Error('UserPoolId or ClientId is missing.');
      }

      const command = new UpdateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientId: clientId,
        ExplicitAuthFlows: [
          'ALLOW_USER_PASSWORD_AUTH',
          'ALLOW_REFRESH_TOKEN_AUTH',
          'ALLOW_USER_SRP_AUTH',
          'ALLOW_ADMIN_USER_PASSWORD_AUTH',
        ],
      });

      const response = await this.client.send(command);
      console.log('User Pool Client Updated successfully.');
      return response;
    } catch (error) {
      console.error('Error updating User Pool client:', error.message);
      throw error;
    }
  }

  async deleteUserPool(userPoolId: string) {
    try {
      const command = new DeleteUserPoolCommand({ UserPoolId: userPoolId });
      await this.client.send(command);
      console.log(`User pool with ID ${userPoolId} deleted successfully.`);
    } catch (error) {
      console.error('Error deleting user pool:', error.message);
      throw error;
    }
  }
}
