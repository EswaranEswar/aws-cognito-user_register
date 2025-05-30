import { Controller, Post, Body, Delete, Get, BadRequestException, HttpException, HttpStatus, Res, Session, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { CognitoService } from 'src/cognito/cognito.service';
import { GetCookiesService } from '../cookies/cookies.service';
import { UserRepository } from './user.repository';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly cognitoService: CognitoService,
    private readonly getCookiesService: GetCookiesService,
    private readonly userRepository: UserRepository
  ) {}

  //cognito user pool related endpoints
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
        response
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
      return { message: `User pool with ID ${userPoolId} deleted successfully.` };
    } catch (error) {
      throw new HttpException(`Failed to delete user pool: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }


  //faker user related endpoints
  @Post('create-faker-users')
  async createFakerUsers(@Body() body: { count: number; password?: string }) {
    const { count, password } = body;
    const users = await this.usersService.createFakerUsers(count, password || 'Test@123');
    return {
      message: `Created ${users.length} fake users`,
      users: users.map((u) => ({ email: u.email, name: u.name }))
    };
  }

  @Post('login')
  async loginUser(@Body() body: { email: string; password: string }) {
    const { email, password } = body;
    return this.usersService.loginUser(email, password);
  }

  @Delete('delete')
  async deleteUsers(@Body('usernames') emails: string[] | string) {
    if (!emails || (Array.isArray(emails) && emails.length === 0)) {
      throw new BadRequestException('Please provide at least one email to delete.');
    }

    const emailList: string[] = Array.isArray(emails) ? emails : emails.split(',').map((u) => u.trim());
    await this.usersService.deleteMultipleUsers(emailList);

    return { message: `Users deleted successfully` };
  }

  //get cookies for faker users
  @Get('generate-cookies')
  async generateCookies() {
    return await this.getCookiesService.fetchAllCookies();
  }

}
