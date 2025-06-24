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

  @Post('update-userpool-client')
  async updateUserPoolClient() {
    try {
      const response = await this.cognitoService.updateUserPoolClient();
      return {
        message: 'User Pool Client updated successfully.',
        response,
      };
    } catch (error) {
      throw new BadRequestException('Failed to update User Pool client.');
    }
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
}