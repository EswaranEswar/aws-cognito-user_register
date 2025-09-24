import {
  Controller,
  Post,
  Body,
  Delete,
  Get,
  BadRequestException,
  HttpException,
  HttpStatus,
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

  @Post('create-user')
  async createUser(
    @Body() body: { email: string; password: string; name?: string },
  ) {
    const { email, password, name } = body;
  
    if (!email || !password) {
      throw new HttpException('Email and password are required', HttpStatus.BAD_REQUEST);
    }
  
    const userName = name || email.split('@')[0]; // Fallback to local part of email
    const user = await this.usersService.createSingleUser({name: userName, email, password});
  
    return {
      message: `User ${email} created successfully`,
      user,
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
  @Post('generate-cookies')
  async generateCookies() {
    // Get users who need cookies
    const usersNeedingCookies = await this.userRepository.getUsersNeedingCookies();
    
    if (usersNeedingCookies.length === 0) {
      return {
        message: 'No users need cookies at this time',
        count: 0,
        createdCount: 0,
        users: [],
        updatedUsers: [],
        cookies: [],
      };
    }

    // Get real cookies using the cookies service
    const cookieResults = await this.getCookiesService.fetchAllCookies( );
    
    // Get updated user data after cookies were generated
    const updatedUsers = await this.userRepository.getUsersNeedingCookies();
    
    return {
      message: `Generated real cookies for ${cookieResults.cookies.length} out of ${usersNeedingCookies.length} users`,
      count: usersNeedingCookies.length,
      createdCount: cookieResults.cookies.length,
      users: usersNeedingCookies.map((user) => ({
        email: user.email,
        name: user.name,
        Cookies: !!user.cookies,
        cookieExpiry: user.cookieExpiry,
      })),
      updatedUsers: updatedUsers.map((user) => ({
        email: user.email,
        name: user.name,
        Cookies: !!user.cookies,
        cookieExpiry: user.cookieExpiry,
      })),
      cookies: cookieResults.cookies,
    };
  }

  @Post('get-cookies')
  async getCookies(@Body('input') input: string) {
    return await this.usersService.getCookies(input);
  }

  @Post('user-login')
  async singleUserLogin(@Body() body: { email: string; password: string }) {
    const { email, password } = body;
    
    if (!email || !password) {
      throw new HttpException('Email and password are required', HttpStatus.BAD_REQUEST);
    }

    return await this.usersService.singleUserLogin(email, password);
  }
}
