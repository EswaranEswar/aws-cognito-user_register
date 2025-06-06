import { Module } from "@nestjs/common";
import { SocketService } from "./socket.service";
import { SocketController } from "./socket.controller";

@Module({
    imports: [],
    providers: [SocketService],
    controllers: [SocketController]
})

export class SocketModule {}