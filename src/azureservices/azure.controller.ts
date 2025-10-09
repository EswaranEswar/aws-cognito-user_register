import { Controller, Post, Body } from '@nestjs/common';
import { AzureIamService } from './azure.service';

export class CreateUserDto {
  prefix: string;
}

@Controller('azure')
export class AzureController {
  constructor(private readonly azureIamService: AzureIamService) {}

  @Post('create-iam-user')
  async createUser(@Body() body: CreateUserDto) {
    const { prefix } = body;
    return await this.azureIamService.createServicePrincipalWithRole(prefix);
  }
}
