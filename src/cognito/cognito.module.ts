import { Module } from '@nestjs/common';
import { CognitoService } from './cognito.service';
import { AppConfigModule } from '../config/config.module';

@Module({
  imports: [AppConfigModule],
  providers: [CognitoService],
  exports: [CognitoService],
})
export class CognitoModule {}
