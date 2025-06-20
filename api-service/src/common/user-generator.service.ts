import { Injectable } from '@nestjs/common';
import { faker } from '@faker-js/faker';

@Injectable()
export class UserGeneratorService {
  generateFakeUsers(count: number, password: string) {
    const newUsers = this.createUniqueUsers(count);
    return newUsers.map(user => ({
      ...user,
      password: password || 'Test@123'
    }));
  }

  private createUniqueUsers(count: number) {
    const newUsers = [];
    const existingEmails = new Set();

    while (newUsers.length < count) {
      const user = {
        name: faker.person.fullName(),
        email: faker.internet.email(),
      };

      if (!existingEmails.has(user.email)) {
        newUsers.push(user);
        existingEmails.add(user.email);
      }
    }

    return newUsers;
  }
}