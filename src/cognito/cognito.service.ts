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
import { 
  IAMClient, 
  CreateUserCommand, 
  AttachUserPolicyCommand, 
  CreateAccessKeyCommand ,
  DetachUserPolicyCommand,
  ListAttachedUserPoliciesCommand,
  ListAccessKeysCommand,
  DeleteAccessKeyCommand,
  DeleteLoginProfileCommand,
  ListGroupsForUserCommand,
  RemoveUserFromGroupCommand,
  ListUserPoliciesCommand,
  DeleteUserPolicyCommand,
  DeleteUserCommand,
} from "@aws-sdk/client-iam";
import { AppConfigService } from '../config/config.service';
import * as crypto from 'crypto';
const pLimit = require('p-limit');

@Injectable()
export class CognitoService {
  private readonly logger = new Logger(CognitoService.name);
  private client: CognitoIdentityProviderClient;
  private limit = pLimit(25); // Increased from 10 to 25 for better concurrency
  private readonly iamClient = new IAMClient({ region: this.config.cognitoRegion });


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

  //Register the new users
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

  // Creating a multiple Iam Users
async createUsers(username: string) {
  const POWER_USER_POLICY_ARN = 'arn:aws:iam::aws:policy/PowerUserAccess';
  const createdUsers: Array<{ username: string; accessKeyId: string; secretAccessKey: string }> = [];

  try {
    // Create IAM user
    await this.iamClient.send(new CreateUserCommand({ UserName: username }));
    console.log(`Created user: ${username}`);

    // Attach PowerUserAccess policy
    await this.iamClient.send(
      new AttachUserPolicyCommand({
        UserName: username,
        PolicyArn: POWER_USER_POLICY_ARN,
      }),
    );
    console.log(`Attached PowerUserAccess policy to: ${username}`);

    // Create access key for the user
    const accessKeyResponse = await this.iamClient.send(
      new CreateAccessKeyCommand({ UserName: username }),
    );

    const { AccessKey } = accessKeyResponse;
    if (AccessKey) {
      console.log(`Access Key created for user ${username}: ID=${AccessKey.AccessKeyId}`);
      createdUsers.push({
        username,
        accessKeyId: AccessKey.AccessKeyId!,
        secretAccessKey: AccessKey.SecretAccessKey!,
      });
    }
  } catch (error) {
    if ((error as any).name === 'EntityAlreadyExistsException') {
      console.warn(`User ${username} already exists, skipping...`);
    } else {
      console.error(`Failed creating user ${username}:`, error);
    }
  }

  console.log('All created users with access keys:', createdUsers);
  return createdUsers;
}

  //Login the cognito useres
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
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
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

  async deleteIAMUser(username: string) {
  // Detach policies
  const attachedPolicies = await this.iamClient.send(new ListAttachedUserPoliciesCommand({ UserName: username }));
  for (const policy of attachedPolicies.AttachedPolicies ?? []) {
    await this.iamClient.send(new DetachUserPolicyCommand({ UserName: username, PolicyArn: policy.PolicyArn! }));
  }

  // Delete access keys
  const accessKeys = await this.iamClient.send(new ListAccessKeysCommand({ UserName: username }));
  for (const key of accessKeys.AccessKeyMetadata ?? []) {
    await this.iamClient.send(new DeleteAccessKeyCommand({ UserName: username, AccessKeyId: key.AccessKeyId! }));
  }

  // Delete login profile
  try {
    await this.iamClient.send(new DeleteLoginProfileCommand({ UserName: username }));
  } catch (err) {
    // ignore if no login profile
  }

  // Remove from groups
  const groups = await this.iamClient.send(new ListGroupsForUserCommand({ UserName: username }));
  for (const group of groups.Groups ?? []) {
    await this.iamClient.send(new RemoveUserFromGroupCommand({ GroupName: group.GroupName!, UserName: username }));
  }

  // Remove inline policies
  const policies = await this.iamClient.send(new ListUserPoliciesCommand({ UserName: username }));
  for (const policyName of policies.PolicyNames ?? []) {
    await this.iamClient.send(new DeleteUserPolicyCommand({ UserName: username, PolicyName: policyName }));
  }

  // Finally delete the user
  await this.iamClient.send(new DeleteUserCommand({ UserName: username }));
  console.log(`Deleted user: ${username}`);
}
}
