import {
  Controller,
  HttpException,
  HttpStatus,
  Get,
  Post,
  Body,
  Delete,
  BadRequestException,
} from '@nestjs/common';
import { CognitoService } from './cognito.service';

@Controller('cognito')
export class CognitoController {
  constructor(private readonly cognitoService: CognitoService) {}


  @Get('user-pools')
  async getUserPools() {
    return this.cognitoService.getUserPools();
  }

  @Get('list-users')
  async getAllUsers() {
    return this.cognitoService.getAllUsers();
  }

  @Post('create-user-pool')
  createPool(@Body('poolName') poolName: string) {
    return this.cognitoService.createUserPool(poolName);
  }

  @Post('update-user-pool-client')
  async updateUserPoolClient() {
    return await this.cognitoService.updateUserPoolClient();
  }

  @Delete('delete-pool')
  async deleteUserPool(@Body() body: { userPoolId: string }) {
    const { userPoolId } = body;

    if (!userPoolId) {
      throw new HttpException('UserPoolId is required', HttpStatus.BAD_REQUEST);
    }

    try {
      await this.cognitoService.deleteUserPool(userPoolId);
      return {
        message: `User pool with ID ${userPoolId} deleted successfully.`,
      };
    } catch (error) {
      throw new HttpException(
        `Failed to delete user pool: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('create-iam-users')
  async createUser(@Body() body: { prefix: string }) {
    const { prefix } = body;
  
    if (!prefix) {
      throw new HttpException('Prefix is required', HttpStatus.BAD_REQUEST);
    }
  
    const {accessKeyId,secretAccessKey} = await this.cognitoService.createUsers(prefix);
  
    return {
      message: `User created successfully`,
      accessKeyId,
      secretAccessKey,
    };
  }
  

    @Delete('delete-iam-user')
    async deleteUser(@Body() body: { username: string }) {
      const { username } = body;
  
      if (!username) {
        throw new HttpException('Username is required', HttpStatus.BAD_REQUEST);
      }
      return await this.cognitoService.deleteIAMUser(username);
    }
  }