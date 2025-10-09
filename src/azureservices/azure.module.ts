import { Module } from '@nestjs/common';
import { AzureIamService } from './azure.service';
import { AzureController } from './azure.controller';
import { AppConfigModule } from '../config/config.module';

@Module({
  imports: [AppConfigModule],
  controllers: [AzureController],
  providers: [AzureIamService],
  exports: [AzureIamService],
})
export class AzureModule {}
