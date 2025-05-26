import { Controller, Post, Body, Delete, Get, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { UsersService } from './users.service';
import { CognitoService } from 'src/cognito/cognito.service';


@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly cognitoService: CognitoService
  ) { }

  @Get('user-pools')
  async getUserPools() {
    return this.cognitoService.getUserPools();
  }

  @Get('list-users')
  async getAllUsers() {
    return this.usersService.getAllUsers()
  }

  @Post('create-user-pool')
  createPool(@Body('poolName') poolName: string) {
    return this.cognitoService.createUserPool(poolName);
  }

  //create faker users
  @Post('create-faker-users')
  async createFakerUsers(
    @Body() body: { count: number, password?: string }
  ) {
    const { count, password } = body;
    const users = await this.usersService.createFakerUsers(
      count,
      password || 'Test@123'
    );

    return {
      message: `Created ${users.length} fake users`,
      users: users.map(u => ({ email: u.email, name: u.name }))
    };
  }


  //create multiple user in increamental method
  @Post('create-multiple')
  async createMultipleUsers(
    @Body() body: { name: string; email: string; count: number, password?: string },
  ) {
    const { name, email, count, password } = body;

    if (!name || !email || !count || count <= 0) {
      throw new BadRequestException(
        'Please provide valid username, email, and count in the request body',
      );
    }

    const userPassword = password || 'Test@123'; // Use default if not provided
    await this.usersService.createMultipleUsers(name, email, count, userPassword);

    return { message: `Created ${count} users successfully` };
  }

  @Post('login')
  async loginUser(@Body() body: { email: string, password: string }) {
    const { email, password } = body;
    return this.usersService.loginUser(email, password);
  }

  @Delete('delete')
  async deleteUsers(@Body('usernames') emails: string[] | string) {
    if (!emails || (Array.isArray(emails) && emails.length === 0)) {
      throw new BadRequestException('Please provide at least one email to delete.');
    }

    const emailList: string[] = Array.isArray(emails)
      ? emails
      : emails.split(',').map((u) => u.trim());

    await this.usersService.deleteMultipleUsers(emailList);

    return { message: `Users deleted successfully` };
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
      return { message: `User pool with ID ${userPoolId} deleted successfully.` };
    } catch (error) {
      throw new HttpException(
        `Failed to delete user pool: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
