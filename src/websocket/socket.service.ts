// Here are the files in copy-paste format:

// ## **File 1: package.json**
// ```
// {
//   "name": "astraops-websocket-test-client",
//   "version": "1.0.0",
//   "description": "External NestJS WebSocket test client for AstraOps",
//   "main": "dist/main.js",
//   "scripts": {
//     "build": "nest build",
//     "start": "nest start",
//     "start:dev": "nest start --watch",
//     "start:prod": "node dist/main"
//   },
//   "dependencies": {
//     "@nestjs/common": "^10.0.0",
//     "@nestjs/core": "^10.0.0",
//     "@nestjs/platform-express": "^10.0.0",
//     "@nestjs/websockets": "^10.0.0",
//     "@nestjs/platform-socket.io": "^10.0.0",
//     "socket.io-client": "^4.7.5",
//     "reflect-metadata": "^0.1.13",
//     "rxjs": "^7.8.1"
//   },
//   "devDependencies": {
//     "@nestjs/cli": "^10.0.0",
//     "@nestjs/schematics": "^10.0.0",
//     "@types/express": "^4.17.17",
//     "@types/node": "^20.3.1",
//     "typescript": "^5.1.3"
//   }
// }
// ```

// ## **File 2: src/main.ts**
// ```
// import { NestFactory } from '@nestjs/core';
// import { AppModule } from './app.module';
// import { Logger } from '@nestjs/common';

// async function bootstrap() {
//     const logger = new Logger('WebSocketTestClient');

//     try {
//         const app = await NestFactory.create(AppModule);

//         const port = process.env.PORT || 3001;
//         await app.listen(port);

//         logger.log(`�� WebSocket Test Client is running on: http://localhost:${port}`);
//         logger.log(`📡 Ready to connect to AstraOps WebSocket server...`);

//     } catch (error) {
//         logger.error('Failed to start WebSocket Test Client:', error);
//         process.exit(1);
//     }
// }

// bootstrap();
// ```

// ## **File 3: src/app.module.ts**
// ```
// import { Module } from '@nestjs/common';
// import { WebSocketTestService } from './websocket-test.service';
// import { LoadTestController } from './load-test.controller';

// @Module({
//   imports: [],
//   controllers: [LoadTestController],
//   providers: [WebSocketTestService],
// })
// export class AppModule {}
// ```

// ## **File 4: src/websocket-test.service.ts**
// ```
// import { Injectable, Logger } from '@nestjs/common';
// import { io, Socket } from 'socket.io-client';

// interface TestConfig {
//   url: string;
//   maxClients: number;
//   clientCreationInterval: number;
//   emitInterval: number;
//   authToken?: string;
//   sessionId?: string;
//   scenario: string;
// }

// interface ClientStats {
//   id: number;
//   socket: Socket;
//   connected: boolean;
//   packetsSent: number;
//   packetsReceived: number;
//   errors: number;
//   startTime: number;
// }

// interface TestStats {
//   clientCount: number;
//   connectedClients: number;
//   disconnectedClients: number;
//   packetsSent: number;
//   packetsReceived: number;
//   errors: number;
//   lastReport: number;
//   packetsSinceLastReport: number;
// }

// @Injectable()
// export class WebSocketTestService {
//   private readonly logger = new Logger(WebSocketTestService.name);
//   private clients: Map<number, ClientStats> = new Map();
//   private stats: TestStats = {
//     clientCount: 0,
//     connectedClients: 0,
//     disconnectedClients: 0,
//     packetsSent: 0,
//     packetsReceived: 0,
//     errors: 0,
//     lastReport: Date.now(),
//     packetsSinceLastReport: 0,
//   };

//   // AstraOps WebSocket Topics
//   private readonly topics = {
//     // Command Topics (Client -> Server)
//     SEND_DEPLOYMENT_LOGS: 'send-deployment-logs',
//     UPDATE_POSITION: 'update-position',
//     UPDATE_RESOURCE: 'update-resource',
//     UPDATE_RELATIONSHIP: 'update-relationship',
//     UPDATE_MULTI_RELATIONSHIPS: 'update-multi-relationships',
//     UPDATE_NOTIFICATION: 'update-notification',
    
//     // Event Topics (Server -> Client)
//     DEPLOYMENT_LOGS_SENT: 'deployment-logs-sent',
//     POSITION_UPDATED: 'position-updated',
//     RESOURCE_UPDATED: 'resource-updated',
//     RELATIONSHIP_UPDATED: 'relationship-updated',
//     MULTI_RELATIONSHIPS_UPDATED: 'multi-relationships-updated',
//     HLD_DETAILS_UPDATED: 'hld-details-updated',
//     HLD_ATTEMPT_UPDATED: 'hld-attempt-updated',
//     MANAGER_APPROVAL_UPDATED: 'manager-approval-updated',
//     CCM_INFRA_SETUP_STATUS_UPDATED: 'ccm-infra-setup-status-updated',
//     RESOURCE_EXPLORER_STATUS_UPDATED: 'resource-explorer-status-updated',
//     RESOURCE_IMPORTED: 'resource-imported',
//     CCM_STATUS_UPDATED: 'ccm-status-updated',
//     HLD_VERSION_UPDATED: 'hld-version-updated',
//     IMPORT_TRANSFORMER_STATUS_UPDATED: 'import-transformer-status-updated',
//     DEPLOYMENT_UPDATED: 'deployment-updated',
//     AUDIT_LOG: 'audit-log',
//     GENERATED_AI_RESPONSE: 'generated-ai-response',
//     AI_STREAM_START: 'ai-stream-start',
//     AI_STREAM_CHUNK: 'ai-stream-chunk',
//     AI_STREAM_COMPLETE: 'ai-stream-complete',
//     AI_STREAM_ERROR: 'ai-stream-error',
//     AI_RESPONSE: 'ai-response',
//     NOTIFICATIONS: 'notifications',
//     DEPLOYMENT_ACTIONS_UPDATED: 'deployment-actions-updated',
//     DEPLOYMENT_ACTIONS_CREATED: 'deployment-actions-created',
    
//     // Internal Topics
//     E_NOTIFY: 'e_notify',
//     E_NOTIFY_USER: 'e_notify_user',
//     E_HELLO_WORLD: 'e_hello_world',
//   };

//   private readonly testScenarios = {
//     BASIC: {
//       sendTopic: this.topics.E_NOTIFY,
//       receiveTopics: [this.topics.E_NOTIFY, this.topics.E_NOTIFY_USER],
//       message: { test: 'basic connectivity test', timestamp: Date.now() }
//     },
//     RESOURCE: {
//       sendTopic: this.topics.UPDATE_RESOURCE,
//       receiveTopics: [this.topics.RESOURCE_UPDATED],
//       message: {
//         versionId: 'test-version-123',
//         resourceId: 'test-resource-456',
//         resource: {
//           name: 'test-resource',
//           type: 'aws-ec2-instance',
//           properties: { instanceType: 't3.micro' }
//         }
//       }
//     },
//     DEPLOYMENT: {
//       sendTopic: this.topics.SEND_DEPLOYMENT_LOGS,
//       receiveTopics: [this.topics.DEPLOYMENT_LOGS_SENT],
//       message: {
//         deploymentId: 'test-deployment-789',
//         logs: ['Starting deployment...', 'Deployment in progress...', 'Deployment completed']
//       }
//     },
//     POSITION: {
//       sendTopic: this.topics.UPDATE_POSITION,
//       receiveTopics: [this.topics.POSITION_UPDATED],
//       message: {
//         positionId: 'test-position-101',
//         x: Math.random() * 1000,
//         y: Math.random() * 1000,
//         z: 0
//       }
//     },
//     NOTIFICATION: {
//       sendTopic: this.topics.UPDATE_NOTIFICATION,
//       receiveTopics: [this.topics.NOTIFICATIONS],
//       message: {
//         notificationId: 'test-notification-202',
//         title: 'Test Notification',
//         description: 'This is a test notification from load test',
//         read: false,
//         timestamp: new Date().toISOString()
//       }
//     },
//     CCM: {
//       sendTopic: this.topics.E_HELLO_WORLD,
//       receiveTopics: [this.topics.CCM_STATUS_UPDATED],
//       message: {
//         hldId: 'test-hld-303',
//         versionId: 1,
//         attemptId: 1
//       }
//     },
//     AI: {
//       sendTopic: this.topics.AI_RESPONSE,
//       receiveTopics: [this.topics.AI_STREAM_START, this.topics.AI_STREAM_CHUNK, this.topics.AI_STREAM_COMPLETE],
//       message: {
//         prompt: 'Test AI prompt for load testing',
//         sessionId: 'test-session-123'
//       }
//     }
//   };

//   async startLoadTest(config: TestConfig): Promise<void> {
//     this.logger.log(`🚀 Starting WebSocket Load Test`);
//     this.logger.log(`📊 Configuration:`);
//     this.logger.log(`   URL: ${config.url}`);
//     this.logger.log(`   Max Clients: ${config.maxClients}`);
//     this.logger.log(`   Scenario: ${config.scenario}`);
//     this.logger.log(`   Auth Token: ${config.authToken ? 'Provided' : 'Not provided'}`);

//     const scenario = this.testScenarios[config.scenario];
//     if (!scenario) {
//       throw new Error(`Invalid test scenario: ${config.scenario}`);
//     }

//     this.logger.log(`   Send Topic: ${scenario.sendTopic}`);
//     this.logger.log(`   Receive Topics: ${scenario.receiveTopics.join(', ')}`);

//     // Create clients with staggered intervals
//     for (let i = 0; i < config.maxClients; i++) {
//       setTimeout(() => {
//         this.createClient(i, config, scenario);
//         this.stats.clientCount++;
//       }, i * config.clientCreationInterval);
//     }

//     // Start reporting
//     this.startReporting();
//   }

//   private createClient(clientId: number, config: TestConfig, scenario: any): void {
//     const transports = Math.random() < 0.05 ? ["polling"] : ["polling", "websocket"];

//     const socketOptions = {
//       transports,
//       auth: config.authToken ? { token: config.authToken } : undefined,
//       extraHeaders: config.authToken ? { 
//         'Authorization': `Bearer ${config.authToken}`,
//         'Cookie': `connect.sid=${config.sessionId || `test-session-${Date.now()}`}`
//       } : undefined,
//       forceNew: true,
//       timeout: 20000,
//     };

//     const socket = io(config.url, socketOptions);
    
//     // Track client
//     this.clients.set(clientId, {
//       id: clientId,
//       socket,
//       connected: false,
//       packetsSent: 0,
//       packetsReceived: 0,
//       errors: 0,
//       startTime: Date.now()
//     });

//     // Connection event handlers
//     socket.on('connect', () => {
//       this.logger.log(`✅ Client ${clientId} connected (${transports.join(', ')})`);
//       this.clients.get(clientId).connected = true;
//       this.stats.connectedClients++;
      
//       // Start sending messages for this client
//       this.startClientMessageLoop(clientId, scenario);
//     });

//     socket.on('disconnect', (reason) => {
//       this.logger.log(`❌ Client ${clientId} disconnected: ${reason}`);
//       const client = this.clients.get(clientId);
//       if (client && client.connected) {
//         client.connected = false;
//         this.stats.connectedClients--;
//         this.stats.disconnectedClients++;
//       }
//     });

//     socket.on('connect_error', (error) => {
//       this.logger.error(`�� Client ${clientId} connection error:`, error.message);
//       this.stats.errors++;
//       this.clients.get(clientId).errors++;
//     });

//     // Listen for all scenario receive topics
//     scenario.receiveTopics.forEach(topic => {
//       socket.on(topic, (data) => {
//         this.stats.packetsReceived++;
//         this.stats.packetsSinceLastReport++;
//         this.clients.get(clientId).packetsReceived++;
        
//         this.logger.debug(`📨 Client ${clientId} received on ${topic}:`, JSON.stringify(data).substring(0, 100));
//       });
//     });

//     // Generic error handler
//     socket.on('error', (error) => {
//       this.logger.error(`💥 Client ${clientId} error:`, error);
//       this.stats.errors++;
//       this.clients.get(clientId).errors++;
//     });
//   }

//   private startClientMessageLoop(clientId: number, scenario: any): void {
//     const client = this.clients.get(clientId);
//     if (!client) return;

//     const interval = setInterval(() => {
//       if (!client.connected) {
//         clearInterval(interval);
//         return;
//       }

//       const message = {
//         ...scenario.message,
//         clientId,
//         timestamp: Date.now(),
//         sessionId: `test-session-${clientId}`
//       };

//       try {
//         client.socket.emit(scenario.sendTopic, message);
//         this.stats.packetsSent++;
//         client.packetsSent++;
        
//         this.logger.debug(`📤 Client ${clientId} sent to ${scenario.sendTopic}:`, JSON.stringify(message).substring(0, 100));
//       } catch (error) {
//         this.logger.error(`💥 Client ${clientId} send error:`, error);
//         this.stats.errors++;
//         client.errors++;
//       }
//     }, 2000); // Send message every 2 seconds
//   }

//   private startReporting(): void {
//     setInterval(() => {
//       this.printReport();
//     }, 5000); // Report every 5 seconds
//   }

//   private printReport(): void {
//     const now = Date.now();
//     const durationSinceLastReport = (now - this.stats.lastReport) / 1000;
//     const packetsPerSecond = durationSinceLastReport > 0 
//       ? (this.stats.packetsSinceLastReport / durationSinceLastReport).toFixed(2)
//       : '0.00';

//     const connectedCount = Array.from(this.clients.values()).filter(c => c.connected).length;

//     this.logger.log('\n📊 === LOAD TEST REPORT ===');
//     this.logger.log(`⏱️  Time: ${new Date().toLocaleTimeString()}`);
//     this.logger.log(`👥 Clients: ${this.stats.clientCount} total, ${connectedCount} connected, ${this.stats.disconnectedClients} disconnected`);
//     this.logger.log(`📤 Packets Sent: ${this.stats.packetsSent} total, ${this.stats.packetsSinceLastReport} in last ${durationSinceLastReport.toFixed(1)}s`);
//     this.logger.log(`�� Packets Received: ${this.stats.packetsReceived} total`);
//     this.logger.log(`📈 Rate: ${packetsPerSecond} packets/second`);
//     this.logger.log(`💥 Errors: ${this.stats.errors} total`);
//     this.logger.log('========================\n');

//     // Reset counters
//     this.stats.packetsSinceLastReport = 0;
//     this.stats.lastReport = now;
//   }

//   async stopLoadTest(): Promise<void> {
//     this.logger.log('🔌 Disconnecting all clients...');
    
//     this.clients.forEach((client, clientId) => {
//       if (client.connected) {
//         client.socket.disconnect();
//         this.logger.log(`🔌 Disconnected client ${clientId}`);
//       }
//     });

//     // Final report
//     setTimeout(() => {
//       this.logger.log('\n📊 === FINAL REPORT ===');
//       this.logger.log(`👥 Total Clients: ${this.stats.clientCount}`);
//       this.logger.log(`📤 Total Packets Sent: ${this.stats.packetsSent}`);
//       this.logger.log(`📨 Total Packets Received: ${this.stats.packetsReceived}`);
//       this.logger.log(`💥 Total Errors: ${this.stats.errors}`);
//       this.logger.log('=====================\n');
//     }, 2000);
//   }

//   getStats(): TestStats {
//     return { ...this.stats };
//   }

//   getAvailableScenarios(): string[] {
//     return Object.keys(this.testScenarios);
//   }
// }
// ```

// ## **File 5: src/load-test.controller.ts**
// ```
// import { Controller, Post, Get, Body, Logger } from '@nestjs/common';
// import { WebSocketTestService } from './websocket-test.service';

// interface LoadTestRequest {
//   url: string;
//   maxClients?: number;
//   clientCreationInterval?: number;
//   emitInterval?: number;
//   authToken?: string;
//   sessionId?: string;
//   scenario: string;
// }

// @Controller('load-test')
// export class LoadTestController {
//   private readonly logger = new Logger(LoadTestController.name);

//   constructor(private readonly webSocketTestService: WebSocketTestService) {}

//   @Post('start')
//   async startLoadTest(@Body() request: LoadTestRequest) {
//     this.logger.log('🎯 Starting load test with request:', request);

//     const config = {
//       url: request.url,
//       maxClients: request.maxClients || 100,
//       clientCreationInterval: request.clientCreationInterval || 100,
//       emitInterval: request.emitInterval || 2000,
//       authToken: request.authToken,
//       sessionId: request.sessionId,
//       scenario: request.scenario,
//     };

//     try {
//       await this.webSocketTestService.startLoadTest(config);
//       return {
//         success: true,
//         message: 'Load test started successfully',
//         config,
//       };
//     } catch (error) {
//       this.logger.error('Failed to start load test:', error);
//       return {
//         success: false,
//         message: error.message,
//         config,
//       };
//     }
//   }

//   @Post('stop')
//   async stopLoadTest() {
//     this.logger.log('�� Stopping load test...');
    
//     try {
//       await this.webSocketTestService.stopLoadTest();
//       return {
//         success: true,
//         message: 'Load test stopped successfully',
//       };
//     } catch (error) {
//       this.logger.error('Failed to stop load test:', error);
//       return {
//         success: false,
//         message: error.message,
//       };
//     }
//   }

//   @Get('stats')
//   getStats() {
//     const stats = this.webSocketTestService.getStats();
//     return {
//       success: true,
//       stats,
//     };
//   }

//   @Get('scenarios')
//   getAvailableScenarios() {
//     const scenarios = this.webSocketTestService.getAvailableScenarios();
//     return {
//       success: true,
//       scenarios,
//     };
//   }

//   @Get('health')
//   healthCheck() {
//     return {
//       success: true,
//       message: 'WebSocket Test Client is running',
//       timestamp: new Date().toISOString(),
//     };
//   }
// }
// ```

// ## **File 6: nest-cli.json**
// ```
// {
//   "$schema": "https://json.schemastore.org/nest-cli",
//   "collection": "@nestjs/schematics",
//   "sourceRoot": "src",
//   "compilerOptions": {
//     "deleteOutDir": true
//   }
// }
// ```

// ## **File 7: tsconfig.json**
// ```
// {
//   "compilerOptions": {
//     "module": "commonjs",
//     "declaration": true,
//     "removeComments": true,
//     "emitDecoratorMetadata": true,
//     "experimentalDecorators": true,
//     "allowSyntheticDefaultImports": true,
//     "target": "ES2020",
//     "sourceMap": true,
//     "outDir": "./dist",
//     "baseUrl": "./",
//     "incremental": true,
//     "skipLibCheck": true,
//     "strictNullChecks": false,
//     "noImplicitAny": false,
//     "strictBindCallApply": false,
//     "forceConsistentCasingInFileNames": false,
//     "noFallthroughCasesInSwitch": false
//   }
// }
// ```

// ## **Usage Commands:**
// ```
// npm install
// npm run start:dev

// curl -X POST http://localhost:3001/load-test/start -H "Content-Type: application/json" -d '{"url": "https://your-qa-server.com", "maxClients": 100, "scenario": "BASIC", "authToken": "your-jwt-token"}'
// ```

// Copy these files to create your external NestJS WebSocket test client!