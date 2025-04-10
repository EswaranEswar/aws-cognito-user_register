import { Injectable } from '@nestjs/common';
import { CognitoService } from '../cognito/cognito.service';
import { generateUsersFromBase, BaseUserDetail, User } from './users.utils';

@Injectable()
export class UsersService {
  constructor(private cognitoService: CognitoService) {}

  async generateAndCreateUsers(baseUser: BaseUserDetail, count: number): Promise<void> {
    const users: User[] = generateUsersFromBase(baseUser, count);

    await Promise.all(
      users.map((user) =>
        this.cognitoService.createUser(user.username, user.email),
      ),
    );
  }
  async deleteMultipleUsers(usernames: string[]): Promise<void> {
    await Promise.all(
      usernames.map((username) => this.cognitoService.deleteUser(username)),
    );
  }
}
