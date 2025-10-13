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
  CreateAccessKeyCommand,
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
  ListUsersCommand as ListIAMUsersCommand,
} from '@aws-sdk/client-iam';
import { fromNodeProviderChain, fromSSO } from '@aws-sdk/credential-providers';
import { AppConfigService } from '../config/config.service';
import * as crypto from 'crypto';
import {
  AssumeRoleCommand,
  GetCallerIdentityCommand,
  STSClient,
} from '@aws-sdk/client-sts';
const pLimit = require('p-limit');

@Injectable()
export class CognitoService {
  private readonly logger = new Logger(CognitoService.name);
  private client: CognitoIdentityProviderClient;
  private limit = pLimit(25); // Increased from 10 to 25 for better concurrency
  private iamClient: IAMClient;

  constructor(private readonly config: AppConfigService) {
    const region = this.config.awsRegion;

    // Cognito SSO credentials
    const cognitoProfile = this.config.awsSsoProfile;
    this.client = new CognitoIdentityProviderClient({
      region,
      credentials: fromNodeProviderChain({ profile: cognitoProfile }),
    });

    // IAM SSO credentials (separate)
    const iamProfile = this.config.awsSsoProfileIam;
    this.iamClient = new IAMClient({
      region,
      credentials: fromNodeProviderChain({ profile: iamProfile }),
    });

    // Optional: Verify both profiles
    this.verifySso(cognitoProfile, region, 'Cognito');
    this.verifySso(iamProfile, region, 'IAM');
  }

  private async verifySso(profile: string, region: string, label: string) {
    try {
      const sts = new STSClient({
        region,
        credentials: fromNodeProviderChain({ profile }),
      });
      const identity = await sts.send(new GetCallerIdentityCommand({}));
      console.log(`${label} SSO verified: ${identity.Arn}`);
    } catch (err) {
      console.error(`Failed to verify ${label} SSO [${profile}]:`, err);
    }
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

  // Creating Iam Users
  async createIamUser(username: string) {
    const region = this.config.awsRegion;
    const devIamProfile = this.config.awsSsoProfileIam;

    // Directly use your SSO credentials (no assumeRole)
    const sandboxIam = new IAMClient({
      region,
      credentials: fromSSO({ profile: devIamProfile }),
    });

    try {
      await sandboxIam.send(new CreateUserCommand({ UserName: username }));
      await sandboxIam.send(
        new AttachUserPolicyCommand({
          UserName: username,
          PolicyArn: 'arn:aws:iam::aws:policy/AdministratorAccess',
        }),
      );

      const accessKeyRes = await sandboxIam.send(
        new CreateAccessKeyCommand({ UserName: username }),
      );

      const { AccessKey } = accessKeyRes;
      if (!AccessKey?.AccessKeyId || !AccessKey?.SecretAccessKey) {
        throw new Error('Failed to create access keys for Sandbox user');
      }

      return {
        accessKeyId: AccessKey.AccessKeyId,
        secretAccessKey: AccessKey.SecretAccessKey,
      };
    } catch (err) {
      console.error(`Error creating IAM user ${username}:`, err);
      throw err;
    }
  }

  // async createIamUser(username: string) {
  //   const region = this.config.awsRegion;
  //   const devSsoProfile = this.config.awsSsoProfileIam;

  //   //Get Dev SSO credentials
  //   const devCredentials = fromSSO({ profile: devSsoProfile });

  //   //Assume Sandbox role
  //   const sts = new STSClient({ region, credentials: devCredentials });

  //   const assumeRoleResponse = await sts.send(
  //     new AssumeRoleCommand({
  //       RoleArn: "arn:aws:iam::503561454314:role/SandboxIamProvisionerRole", // Sandbox role ARN
  //       RoleSessionName: `SandboxIamSession-${Date.now()}`,
  //     })
  //   );

  //   const { AccessKeyId, SecretAccessKey, SessionToken } = assumeRoleResponse.Credentials!;

  //   //Use temporary credentials to create IAM user in Sandbox
  //   const sandboxIam = new IAMClient({
  //     region,
  //     credentials: {
  //       accessKeyId: AccessKeyId,
  //       secretAccessKey: SecretAccessKey,
  //       sessionToken: SessionToken,
  //     },
  //   });

  //   try {
  //     await sandboxIam.send(new CreateUserCommand({ UserName: username }));
  //     console.log(`Created IAM user in Sandbox: ${username}`);

  //     await sandboxIam.send(
  //       new AttachUserPolicyCommand({
  //         UserName: username,
  //         PolicyArn: "arn:aws:iam::aws:policy/AdministratorAccess",
  //       })
  //     );
  //     console.log(`Attached Admin policy to: ${username}`);

  //     const accessKeyRes = await sandboxIam.send(
  //       new CreateAccessKeyCommand({ UserName: username })
  //     );

  //     const { AccessKey } = accessKeyRes;
  //     return {
  //       accessKeyId: AccessKey?.AccessKeyId,
  //       secretAccessKey: AccessKey?.SecretAccessKey,
  //     };
  //   } catch (err) {
  //     console.error(`Error creating Sandbox IAM user ${username}:`, err);
  //     throw err;
  //   }
  // }

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
    const attachedPolicies = await this.iamClient.send(
      new ListAttachedUserPoliciesCommand({ UserName: username }),
    );
    for (const policy of attachedPolicies.AttachedPolicies ?? []) {
      await this.iamClient.send(
        new DetachUserPolicyCommand({
          UserName: username,
          PolicyArn: policy.PolicyArn!,
        }),
      );
    }

    // Delete access keys
    const accessKeys = await this.iamClient.send(
      new ListAccessKeysCommand({ UserName: username }),
    );
    for (const key of accessKeys.AccessKeyMetadata ?? []) {
      await this.iamClient.send(
        new DeleteAccessKeyCommand({
          UserName: username,
          AccessKeyId: key.AccessKeyId!,
        }),
      );
    }

    // Delete login profile
    try {
      await this.iamClient.send(
        new DeleteLoginProfileCommand({ UserName: username }),
      );
    } catch (err) {
      // ignore if no login profile
    }

    // Remove from groups
    const groups = await this.iamClient.send(
      new ListGroupsForUserCommand({ UserName: username }),
    );
    for (const group of groups.Groups ?? []) {
      await this.iamClient.send(
        new RemoveUserFromGroupCommand({
          GroupName: group.GroupName!,
          UserName: username,
        }),
      );
    }

    // Remove inline policies
    const policies = await this.iamClient.send(
      new ListUserPoliciesCommand({ UserName: username }),
    );
    for (const policyName of policies.PolicyNames ?? []) {
      await this.iamClient.send(
        new DeleteUserPolicyCommand({
          UserName: username,
          PolicyName: policyName,
        }),
      );
    }

    // Finally delete the user
    await this.iamClient.send(new DeleteUserCommand({ UserName: username }));
    console.log(`Deleted user: ${username}`);
  }

  // List all IAM users with optional filtering
  async getAllIAMUsers(
    usernameFilter?: string,
    exactMatch: boolean = false
  ): Promise<any[]> {
    try {
      const command = new ListIAMUsersCommand({});
      const response = await this.iamClient.send(command);
      const users = response.Users || [];

      let filteredUsers = users;

      // Apply username filter if provided
      if (usernameFilter) {
        if (exactMatch) {
          // Exact match (case-insensitive)
          filteredUsers = users.filter((user) =>
            user.UserName?.toLowerCase() === usernameFilter.toLowerCase()
          );
        } else {
          // Partial match (case-insensitive)
          filteredUsers = users.filter((user) =>
            user.UserName?.toLowerCase().includes(usernameFilter.toLowerCase())
          );
        }
      }

      const formattedUsers = filteredUsers.map((user) => ({
        username: user.UserName,
        userId: user.UserId,
        arn: user.Arn,
        createDate: user.CreateDate,
        path: user.Path,
      }));

      const filterInfo = usernameFilter
        ? ` (filtered by: ${usernameFilter}${exactMatch ? ' - exact match' : ' - partial match'})`
        : '';

      console.log(`IAM Users${filterInfo}:`, JSON.stringify(formattedUsers, null, 2));
      return formattedUsers;
    } catch (error) {
      console.error('Failed to list IAM users:', error.message);
      throw error;
    }
  }

  // Get a specific IAM user by username
  async getIAMUserByUsername(username: string): Promise<any | null> {
    try {
      const users = await this.getAllIAMUsers(username, true);
      return users.length > 0 ? users[0] : null;
    } catch (error) {
      console.error(`Failed to get IAM user ${username}:`, error.message);
      throw error;
    }
  }

  // Get only usernames (filtered list)
  async getIAMUsernames(
    usernameFilter?: string,
    exactMatch: boolean = false
  ): Promise<string[]> {
    try {
      const command = new ListIAMUsersCommand({});
      const response = await this.iamClient.send(command);
      const users = response.Users || [];

      let filteredUsers = users;

      // Apply username filter if provided
      if (usernameFilter) {
        if (exactMatch) {
          // Exact match (case-insensitive)
          filteredUsers = users.filter((user) =>
            user.UserName?.toLowerCase() === usernameFilter.toLowerCase()
          );
        } else {
          // Partial match (case-insensitive)
          filteredUsers = users.filter((user) =>
            user.UserName?.toLowerCase().includes(usernameFilter.toLowerCase())
          );
        }
      }

      // Return only usernames
      const usernames = filteredUsers
        .map((user) => user.UserName)
        .filter((username): username is string => username !== undefined);

      const filterInfo = usernameFilter
        ? ` (filtered by: ${usernameFilter}${exactMatch ? ' - exact match' : ' - partial match'})`
        : '';

      console.log(`IAM Usernames${filterInfo}:`, usernames);
      return usernames;
    } catch (error) {
      console.error('Failed to list IAM usernames:', error.message);
      throw error;
    }
  }

  // Delete multiple IAM users from a list
  async deleteMultipleIAMUsers(usernames: string[]): Promise<{
    successful: string[],
    failed: { username: string, error: string }[]
  }> {
    const successful: string[] = [];
    const failed: { username: string, error: string }[] = [];

    console.log(`Starting deletion of ${usernames.length} IAM users...`);

    // Use the existing limit for concurrency control
    const deletePromises = usernames.map(username =>
      this.limit(async () => {
        try {
          await this.deleteIAMUser(username);
          successful.push(username);
          console.log(`✓ Successfully deleted IAM user: ${username}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          failed.push({ username, error: errorMessage });
          console.error(`✗ Failed to delete IAM user ${username}: ${errorMessage}`);
        }
      })
    );

    await Promise.all(deletePromises);

    console.log(`Deletion completed. Successful: ${successful.length}, Failed: ${failed.length}`);

    return { successful, failed };
  }

  // Delete all IAM users (convenience method)
  async deleteAllIAMUsers(): Promise<{
    successful: string[],
    failed: { username: string, error: string }[]
  }> {
    try {
      const users = await this.getAllIAMUsers();
      const usernames = users.map(user => user.username);

      if (usernames.length === 0) {
        console.log('No IAM users found to delete.');
        return { successful: [], failed: [] };
      }

      console.log(`Found ${usernames.length} IAM users to delete.`);
      return await this.deleteMultipleIAMUsers(usernames);
    } catch (error) {
      console.error('Failed to get IAM users for deletion:', error.message);
      throw error;
    }
  }
}
