import { Module } from "@nestjs/common";
import { DatabaseService } from "./database.service";
import { AppConfigModule } from "../config/config.module";

@Module({
    imports: [AppConfigModule],
    providers: [DatabaseService],
    exports: [DatabaseService],
})
export class DatabaseModule {}