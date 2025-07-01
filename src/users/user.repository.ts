import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/mongodb/database.service';
import { User, UserSchema, UserDocument } from './schemas/user.schema';
import { Model } from 'mongoose';

@Injectable()
export class UserRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async createUser(
    name: string,
    email: string,
  ): Promise<UserDocument> {
    const model = await this.databaseService.getModel({
      name: 'User',
      schema: UserSchema,
    });
  
    return model.create({ name, email });
  }

  async getUserByEmail(email: string): Promise<UserDocument | null> {
    const model = await this.databaseService.getModel({
      name: 'User',
      schema: UserSchema,
    });
    return model.findOne({ email });
  }

  async updateUserCookies(
    email: string,
    cookies: string,
    expiryHours: number = 24,
  ): Promise<UserDocument | null> {
    const model = await this.databaseService.getModel({
      name: 'User',
      schema: UserSchema,
    });
    const cookieExpiry = new Date();
    cookieExpiry.setHours(cookieExpiry.getHours() + expiryHours);

    await model.updateOne(
      { email },
      {
        cookies,
        cookieExpiry,
      },
    );
    return this.getUserByEmail(email);
  }

  async getUsersNeedingCookies(): Promise<any[]> {
    const model = await this.databaseService.getModel({
      name: 'User',
      schema: UserSchema,
    });
    const now = new Date();

    const users = await model
      .find({
        $or: [
          { cookies: { $exists: false } },
          { cookies: null },
          { cookies: '' },
          { cookieExpiry: { $lt: now } },
        ],
      })
      .lean()
      .exec();

    console.log('Found users needing cookies:', users.length);
    users.forEach((user) => {
      console.log(
        `User: ${user.email}, cookies: "${user.cookies}", cookieExpiry: ${user.cookieExpiry}`,
      );
    });

    return users;
  }

  async getModel(): Promise<Model<UserDocument>> {
    return this.databaseService.getModel({ name: 'User', schema: UserSchema });
  }

  async getCookies(input: string): Promise<string[]> {
    const model = await this.databaseService.getModel({
      name: 'User',
      schema: UserSchema,
    });
    const users = await model.find({}).lean().exec();
    return users
      .map((user) => user[input])
      .filter((value) => value && value.trim() !== '');
  }
}
