import { Module } from '@nestjs/common';
import { CognitoService } from './cognito.service';
import { AppConfigModule } from '../config/config.module';
import { CognitoController } from './cognito.controller';

@Module({
  imports: [AppConfigModule],
  providers: [CognitoService],
  controllers: [CognitoController],
  exports: [CognitoService],
})
export class CognitoModule {}
