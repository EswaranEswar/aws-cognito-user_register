import { Injectable, Logger } from '@nestjs/common';
import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { AppConfigService } from '../config/config.service';
import 'isomorphic-fetch';

@Injectable()
export class AzureService {
  private readonly logger = new Logger(AzureService.name);
  private graphClient: any;

  constructor(private config: AppConfigService) {
    this.initializeAzureClient();
  }

  private initializeAzureClient() {
    const tenantId = this.config.azureTenantId;
    const clientId = this.config.azureClientId;
    const clientSecret = this.config.azureClientSecret;

    if (!tenantId || !clientId || !clientSecret) {
      this.logger.warn('Azure credentials not configured. Azure service will not be available.');
      this.logger.warn('Required environment variables: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET');
      return;
    }

    try {
      const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);

      this.graphClient = Client.initWithMiddleware({
        authProvider: {
          getAccessToken: async () => {
            const token = await credential.getToken('https://graph.microsoft.com/.default');
            return token?.token!;
          },
        },
      });

      this.logger.log('Azure Graph client initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Azure Graph client:', error.message);
    }
  }

  /** Create Service Principal (Azure IAM equivalent) */
  async createServicePrincipalUser(username: string) {
    if (!this.graphClient) {
      throw new Error('Azure Graph client not initialized. Please configure Azure credentials.');
    }

    const createdUsers: Array<{ 
      username: string; 
      clientId: string; 
      clientSecret: string; 
      tenantId: string;
      objectId: string;
    }> = [];

    try {
      const app = await this.graphClient.api('/applications').post({
        displayName: `${username}-app`,
        signInAudience: 'AzureADMyOrg',
      });
      
      this.logger.log(`Created App registration: ${username}-app (${app.id})`);

      const sp = await this.graphClient.api('/servicePrincipals').post({
        appId: app.appId,
        displayName: `${username}-sp`,
      });
      
      this.logger.log(`Created Service Principal: ${username}-sp (${sp.id})`);

      const secret = await this.graphClient
        .api(`/applications/${app.id}/addPassword`)
        .post({
          passwordCredential: {
            displayName: `${username}-secret`,
            endDateTime: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          },
        });

      this.logger.log(`Created client secret for ${username}`);

      await this.assignContributorRole(sp.id);

      createdUsers.push({
        username,
        clientId: app.appId,
        clientSecret: secret.secretText,
        tenantId: this.config.azureTenantId!,
        objectId: sp.id,
      });

      this.logger.log(`Created Service Principal user: ${username}`);
      return createdUsers;

    } catch (error) {
      if (error.message?.includes('already exists')) {
        this.logger.warn(`Service Principal ${username} already exists, skipping...`);
      } else {
        this.logger.error(`Failed creating Service Principal ${username}:`, error);
        throw error;
      }
    }

    return createdUsers;
  }

  /** Assign Contributor role to Service Principal */
  private async assignContributorRole(servicePrincipalId: string) {
    if (!this.graphClient) {
      this.logger.warn('Azure Graph client not initialized, skipping role assignment');
      return;
    }

    try {
      const roles = await this.graphClient.api('/roleManagement/directory/roleDefinitions').get();
      const contributorRole = roles.value.find((role: any) => 
        role.displayName === 'Contributor' || role.displayName === 'User Administrator'
      );

      if (contributorRole) {
        await this.graphClient
          .api('/roleManagement/directory/roleAssignments')
          .post({
            principalId: servicePrincipalId,
            roleDefinitionId: contributorRole.id,
            directoryScopeId: '/',
          });

        this.logger.log(`Assigned ${contributorRole.displayName} role to Service Principal`);
      } else {
        this.logger.warn('Contributor role not found, skipping role assignment');
      }
    } catch (error) {
      this.logger.error('Error assigning role:', error);
    }
  }

  /** Delete Service Principal */
  async deleteServicePrincipalUser(username: string) {
    if (!this.graphClient) {
      throw new Error('Azure Graph client not initialized. Please configure Azure credentials.');
    }

    try {
      const servicePrincipals = await this.graphClient
        .api('/servicePrincipals')
        .filter(`displayName eq '${username}-sp'`)
        .get();

      if (servicePrincipals.value && servicePrincipals.value.length > 0) {
        const sp = servicePrincipals.value[0];
        
        const apps = await this.graphClient
          .api('/applications')
          .filter(`appId eq '${sp.appId}'`)
          .get();

        if (apps.value && apps.value.length > 0) {
          const app = apps.value[0];
          await this.graphClient.api(`/applications/${app.id}`).delete();
          
          this.logger.log(`Deleted Service Principal user: ${username}`);
          return { message: `Service Principal user ${username} deleted successfully` };
        }
      }

      this.logger.warn(`Service Principal ${username} not found`);
      return { message: `Service Principal ${username} not found` };

    } catch (error) {
      this.logger.error(`Error deleting Service Principal ${username}:`, error);
      throw error;
    }
  }

  /** List all Service Principals */
  async listServicePrincipals() {
    if (!this.graphClient) {
      throw new Error('Azure Graph client not initialized. Please configure Azure credentials.');
    }

    try {
      const servicePrincipals = await this.graphClient.api('/servicePrincipals').get();
      
      const formattedSPs = servicePrincipals.value.map((sp: any) => ({
        displayName: sp.displayName,
        appId: sp.appId,
        objectId: sp.id,
        createdDateTime: sp.createdDateTime,
      }));

      this.logger.log(`Found ${formattedSPs.length} Service Principals`);
      return formattedSPs;
    } catch (error) {
      this.logger.error('Error listing Service Principals:', error);
      throw error;
    }
  }
}
