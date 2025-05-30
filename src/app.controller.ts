import { Controller, Delete, Get, Query, Body, Param } from '@nestjs/common';
import { MongooseConnectionStatusType } from './common/schema/connection.schema';
import { AppService } from './app.service';

@Controller('app')
export class AppController {
  constructor(
    private readonly appService: AppService
  ) {}

  @Get('status')
  connectionStatus(): Promise<MongooseConnectionStatusType> {
    return this.appService.getStatus();
  }

  @Get('collections')
  getCollectionNames(): Promise<string[]> {
    return this.appService.getCollectionNames();
  }

  @Delete('collections')
  async deleteCollections(@Body() body: { collections: string[] }) {
    return this.appService.deleteCollections(body.collections);
  }

  @Get('health')
  healthCheck(): { status: string } {
    return { status: "UP" };
  }
}
