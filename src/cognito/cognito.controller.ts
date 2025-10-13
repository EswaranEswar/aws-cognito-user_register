import {
  Controller,
  HttpException,
  HttpStatus,
  Get,
  Post,
  Body,
  Delete,
  BadRequestException,
  Query,
  Param,
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
  
    const {accessKeyId,secretAccessKey} = await this.cognitoService.createIamUser(prefix);
  
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

    @Get('list-iam-users')
    async getAllIAMUsers(
      @Query('username') username?: string,
      @Query('exactMatch') exactMatch?: string
    ) {
      try {
        const isExactMatch = exactMatch === 'true';
        const result = await this.cognitoService.getAllIAMUsers(username, isExactMatch);

        return {
          users: result,
          count: result.length,
          filter: username ? {
            username,
            exactMatch: isExactMatch,
            type: isExactMatch ? 'exact' : 'partial'
          } : null
        };
      } catch (error) {
        throw new HttpException(
          `Failed to list IAM users: ${error.message}`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }

    @Get('iam-user/:username')
    async getIAMUserByUsername(@Param('username') username: string) {
      if (!username) {
        throw new HttpException('Username is required', HttpStatus.BAD_REQUEST);
      }

      try {
        const user = await this.cognitoService.getIAMUserByUsername(username);

        if (!user) {
          throw new HttpException(
            `IAM user '${username}' not found`,
            HttpStatus.NOT_FOUND,
          );
        }

        return {
          user,
          found: true
        };
      } catch (error) {
        if (error instanceof HttpException) {
          throw error;
        }
        throw new HttpException(
          `Failed to get IAM user: ${error.message}`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }

    @Get('iam-usernames')
    async getIAMUsernames(
      @Query('username') username?: string,
      @Query('exactMatch') exactMatch?: string
    ) {
      try {
        const isExactMatch = exactMatch === 'true';
        const usernames = await this.cognitoService.getIAMUsernames(username, isExactMatch);

        return {
          usernames,
          count: usernames.length,
          filter: username ? {
            username,
            exactMatch: isExactMatch,
            type: isExactMatch ? 'exact' : 'partial'
          } : null
        };
      } catch (error) {
        throw new HttpException(
          `Failed to get IAM usernames: ${error.message}`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }

    @Delete('delete-multiple-iam-users')
    async deleteMultipleIAMUsers(@Body() body: { usernames: string[] }) {
      const { usernames } = body;

      if (!usernames || !Array.isArray(usernames) || usernames.length === 0) {
        throw new HttpException(
          'Usernames array is required and must not be empty',
          HttpStatus.BAD_REQUEST,
        );
      }

      try {
        const result = await this.cognitoService.deleteMultipleIAMUsers(usernames);
        return {
          message: `Deletion completed. Successful: ${result.successful.length}, Failed: ${result.failed.length}`,
          ...result,
        };
      } catch (error) {
        throw new HttpException(
          `Failed to delete IAM users: ${error.message}`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }

    @Delete('delete-all-iam-users')
    async deleteAllIAMUsers() {
      try {
        const result = await this.cognitoService.deleteAllIAMUsers();
        return {
          message: `Deletion completed. Successful: ${result.successful.length}, Failed: ${result.failed.length}`,
          ...result,
        };
      } catch (error) {
        throw new HttpException(
          `Failed to delete all IAM users: ${error.message}`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }
  }