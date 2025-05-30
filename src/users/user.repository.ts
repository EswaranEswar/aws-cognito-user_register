import { Injectable } from "@nestjs/common";
import { DatabaseService } from "src/mongodb/database.service";
import { User, UserSchema, UserDocument } from "./schemas/user.schema";
import { Model } from "mongoose";

@Injectable()
export class UserRepository {
    constructor(
        private readonly databaseService: DatabaseService
    ){}

    async createUser(name: string, email: string, password: string): Promise<UserDocument>{
        const model = await this.databaseService.getModel({ name: 'User', schema: UserSchema });
        return model.create({ name, email, password });
    }

    async getUserByEmail(email: string): Promise<UserDocument | null> {
        const model = await this.databaseService.getModel({ name: 'User', schema: UserSchema });
        return model.findOne({ email });
    }

    async updateUserCookies(email: string, cookies: string): Promise<UserDocument | null>{
        const model = await this.databaseService.getModel({ name: 'User', schema: UserSchema });
        await model.updateOne({ email }, { cookies });
        return this.getUserByEmail(email);
    }

    async getModel(): Promise<Model<UserDocument>> {
        return this.databaseService.getModel({ name: 'User', schema: UserSchema });
    }

}
