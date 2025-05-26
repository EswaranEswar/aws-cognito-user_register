import { Injectable } from '@nestjs/common';
import { faker } from '@faker-js/faker';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class UserGeneratorService {
  private readonly DATA_FILE_PATH = path.join(process.cwd(), 'faker-users.json');

  generateFakeUsers(count: number, password: string) {
    const existingData = this.loadExistingUsers();
    const newUsers = this.createUniqueUsers(count, existingData);
    this.saveUsers([...existingData, ...newUsers], password);
    return newUsers;
  }

  private createUniqueUsers(count: number, existingUsers: any[]) {
    const existingEmails = new Set(existingUsers.map(u => u.email));
    const newUsers = [];

    while (newUsers.length < count) {
      const user = {
        name: faker.person.fullName(),
        email: faker.internet.email(),
        password: 'Test@123' // Default or parameterize
      };

      if (!existingEmails.has(user.email)) {
        newUsers.push(user);
        existingEmails.add(user.email);
      }
    }

    return newUsers;
  }

  private loadExistingUsers() {
    try {
      return JSON.parse(fs.readFileSync(this.DATA_FILE_PATH, 'utf-8'));
    } catch {
      return [];
    }
  }

  private saveUsers(users: any[], password: string) {
    const data = users.map(user => ({
      ...user,
      password // Store password with user
    }));
    fs.writeFileSync(this.DATA_FILE_PATH, JSON.stringify(data, null, 2));
  }
}