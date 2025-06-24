import { Controller, Post, Body } from '@nestjs/common';
import { SocketService } from './socket.service';

// DTO for load test parameters
export class LoadTestDto {
  targetUsers: number;
  messagesPerClient: number;
  messageIntervalMs: number;
  rampUpDelayMs: number;
}

@Controller('socket')
export class SocketController {
  constructor(private readonly socketService: SocketService) {}
  
  @Post('run-load-test')
  async runLoadTest(@Body() loadTestParams: LoadTestDto) {
    return this.socketService.runLoadTest(loadTestParams);
  }
}
