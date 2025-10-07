import { Module } from '@nestjs/common';
import { AzureService } from './azure.service';
import { AzureController } from './azure.controller';
import { AppConfigModule } from '../config/config.module';

@Module({
  imports: [AppConfigModule],
  controllers: [AzureController],
  providers: [AzureService],
  exports: [AzureService],
})
export class AzureModule {}
