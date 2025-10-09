import { Injectable, Logger } from '@nestjs/common';
import { ClientSecretCredential } from '@azure/identity';
import { AuthorizationManagementClient } from '@azure/arm-authorization';
import { Client } from '@microsoft/microsoft-graph-client';
import 'isomorphic-fetch';

@Injectable()
export class AzureIamService {
  private readonly logger = new Logger(AzureIamService.name);
  private readonly credential: ClientSecretCredential;
  private readonly graphClient: Client;
  private readonly subscriptionId: string;
  private readonly authClient: AuthorizationManagementClient;

  constructor() {
    this.subscriptionId = process.env.AZURE_SUBSCRIPTION_ID!;
    this.credential = new ClientSecretCredential(
      process.env.AZURE_TENANT_ID!,
      process.env.AZURE_CLIENT_ID!,
      process.env.AZURE_CLIENT_SECRET!,
    );

    this.graphClient = Client.initWithMiddleware({
      authProvider: {
        getAccessToken: async () => {
          const token = await this.credential.getToken(
            'https://graph.microsoft.com/.default',
          );
          return token!.token;
        },
      },
    });

    this.authClient = new AuthorizationManagementClient(
      this.credential,
      this.subscriptionId,
    );
  }

  /**
   * Creates a new Service Principal (IAM User) and assigns a role.
   */
  async createServicePrincipalWithRole(
    displayName: string,
    roleName = 'Contributor',
  ) {
    if (!displayName || displayName.trim() === '') {
      throw new Error(
        'Display name is required to create the Azure application.',
      );
    }

    try {
      const app = await this.graphClient.api('/applications').post({
        displayName: displayName.trim(),
        signInAudience: 'AzureADMyOrg',
      });

      this.logger.log(`Created App Registration: ${app.appId}`);
      //Create Service Principal
      const sp = await this.graphClient.api('/servicePrincipals').post({
        appId: app.appId,
      });

      this.logger.log(`Created Service Principal: ${sp.id}`);

      //Get Role Definition ID
      const rolesIterator = this.authClient.roleDefinitions.list(
        `/subscriptions/${this.subscriptionId}`,
      );

      let roleDef: any = null;
      for await (const role of rolesIterator) {
        if (role.roleName === roleName) {
          roleDef = role;
          break;
        }
      }

      if (!roleDef) {
        throw new Error(`Role ${roleName} not found in subscription`);
      }
      //Assign Role to Service Principal
      const assignmentName = crypto.randomUUID();
      const scope = `/subscriptions/${this.subscriptionId}`;

      await this.authClient.roleAssignments.create(scope, assignmentName, {
        principalId: sp.id,
        roleDefinitionId: roleDef.id!,
        principalType: 'ServicePrincipal',
      });

      this.logger.log(`Assigned ${roleName} role to ${displayName}`);

      //Return credentials (App ID and Object ID)
      return {
        message: 'Service Principal created and role assigned successfully',
        appId: app.appId,
        objectId: sp.id,
        roleAssigned: roleName,
      };
    } catch (error) {
      this.logger.error('Failed creating Service Principal:', error);
      throw error;
    }
  }
}
