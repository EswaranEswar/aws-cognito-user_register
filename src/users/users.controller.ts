import { Controller, Post, Body, Delete, Get, Query, BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { CognitoService } from 'src/cognito/cognito.service';
CognitoService

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly cognitoService: CognitoService
  ) { }

  @Post('create-user-pool')
  async createUserPool(@Query('name') name: string) {
    if (!name) {
      throw new BadRequestException('Please provide a user pool name.');
    }

    await this.cognitoService.createUserPool(name);
    return { message: `User pool '${name}' created.` };
  }

  @Get('user-pools')
  async getUserPools() {
    return this.cognitoService.getUserPools();
  }

  @Post('create')
  async createUsers(
    @Body() baseUser: { username: string; email: string },
    @Query('count') count?: number,
  ) {
    if (!baseUser?.username || !baseUser?.email || !count || count <= 0) {
      throw new BadRequestException('Please provide valid username, email in body and count > 0 in query');
    }

    await this.usersService.generateAndCreateUsers(baseUser, count);
    return { message: 'Users created successfully' };
  }

  @Delete('delete')
  async deleteUsers(@Body('usernames') usernames: string[] | string) {
    if (!usernames || (Array.isArray(usernames) && usernames.length === 0)) {
      throw new BadRequestException('Please provide at least one username to delete.');
    }

    // Support comma-separated string or array
    const usernameList: string[] = Array.isArray(usernames)
      ? usernames
      : usernames.split(',').map((u) => u.trim());

    await this.usersService.deleteMultipleUsers(usernameList);

    return { message: `Users deleted: ${usernameList.join(', ')}` };
  }
}
