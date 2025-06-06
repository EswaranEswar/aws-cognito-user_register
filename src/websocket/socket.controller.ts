import { Controller, Get } from "@nestjs/common";
import { SocketService } from "./socket.service";

@Controller('socket')
export class SocketController {
    constructor(
        private readonly  socketService: SocketService
    ) {}
    @Get('run-load-test')
    async runLoadTest() {
        return this.socketService.runLoadTest();
    }
}