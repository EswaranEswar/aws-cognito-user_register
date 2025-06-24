import {
  Controller,
  Post,
  Body,
  Delete,
  Get,
  BadRequestException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { GetCookiesService } from '../cookies/cookies.service';
import { UserRepository } from './user.repository';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly getCookiesService: GetCookiesService,
    private readonly userRepository: UserRepository,
  ) {}

  @Post('create-faker-users')
  async createFakerUsers(@Body() body: { count: number; password?: string }) {
    const { count, password } = body;
    const users = await this.usersService.createFakerUsers(
      count,
      password || 'Test@123',
    );
    return {
      message: `Created ${users.length} fake users`,
      users: users.map((u) => ({ email: u.email, name: u.name })),
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
      throw new BadRequestException(
        'Please provide at least one email to delete.',
      );
    }

    const emailList: string[] = Array.isArray(emails)
      ? emails
      : emails.split(',').map((u) => u.trim());
    await this.usersService.deleteMultipleUsers(emailList);

    return { message: `Users deleted successfully` };
  }

  //get cookies for faker users
  @Get('generate-cookies')
  async generateCookies() {
    // First, get users who need cookies
    const usersNeedingCookies = await this.userRepository.getUsersNeedingCookies();
    
    if (usersNeedingCookies.length === 0) {
      return {
        message: 'No users need cookies at this time',
      };
    }

    const cookieResults = await this.getCookiesService.fetchAllCookies();
    
    const updatedUsers = await this.userRepository.getUsersNeedingCookies();
    
    return {
      message: `Generated cookies for ${cookieResults.cookies.length} users`,
      count: usersNeedingCookies.length,
      usersNeedingCookies: usersNeedingCookies.map((user) => ({
        email: user.email,
        name: user.name,
        hasCookies: !!user.cookies,
        cookieExpiry: user.cookieExpiry,
      })),
      generatedCookies: cookieResults.cookies.length,
      updatedUsers: updatedUsers.map((user) => ({
        email: user.email,
        name: user.name,
        hasCookies: !!user.cookies,
        cookieExpiry: user.cookieExpiry,
      })),
      cookies: cookieResults.cookies,
    };
  }

  @Post('get-cookies')
  async getCookies(@Body('input') input: string) {
    return await this.usersService.getCookies(input);
  }
}
