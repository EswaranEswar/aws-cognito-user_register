import {
  Controller,
  HttpException,
  HttpStatus,
  Get,
  Post,
  Body,
  Delete,
} from '@nestjs/common';
import { AzureService } from './azure.service';

@Controller('azure')
export class AzureController {
  constructor(private readonly azureService: AzureService) {}

  @Get('list-service-principals')
  async listServicePrincipals() {
    return this.azureService.listServicePrincipals();
  }

  @Post('create-iam-users')
  async createServicePrincipalUser(@Body() body: { prefix: string }) {
    const { prefix } = body;

    if (!prefix) {
      throw new HttpException(
        'Prefix is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    
    const result = await this.azureService.createServicePrincipalUser(prefix);
    return {
      message: `Service Principal users created successfully`,
      users: result,
    };
  }

  @Delete('delete-iam-user')
  async deleteServicePrincipalUser(@Body() body: { username: string }) {
    const { username } = body;

    if (!username) {
      throw new HttpException('Username is required', HttpStatus.BAD_REQUEST);
    }
    
    return await this.azureService.deleteServicePrincipalUser(username);
  }
}
