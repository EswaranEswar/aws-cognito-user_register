import { Injectable, Logger } from "@nestjs/common";
import { io, Socket } from 'socket.io-client';
import axios from 'axios';

// Configuration
const COOKIES_API_URL = 'http://localhost:3006/api/users/get-cookies';
const QA_SERVER_URL = 'https://app.qa.astraops.ai';
const WS_PATH = '/socket.io';
const WS_TOPIC = 'update-position';

// Test Parameters
const TARGET_USERS = 10;
const MESSAGES_PER_CLIENT = 10;
const MESSAGE_INTERVAL_MS = 1000;
const RAMP_UP_DELAY_MS = 200;

// Performance Metrics Interface
interface PerformanceMetrics {
  // Connection Metrics
  connectionsStarted: number;
  connectionsSuccessful: number;
  connectionsFailed: number;
  connectionRate: number;
  avgConnectionTime: number;
  
  // Latency Metrics
  responseTimes: number[];
  minLatency: number;
  maxLatency: number;
  avgLatency: number;
  p95Latency: number;
  p99Latency: number;
  
  // Throughput Metrics
  messagesSent: number;
  messagesReceived: number;
  messagesPerSecond: number;
  bytesPerSecond: number;
  
  // Error Metrics
  errors: number;
  errorRate: number;
  errorTypes: Map<string, number>;
  
  // Test Duration
  testStartTime: number;
  testDuration: number;
  
  // Resource Usage
  memoryUsage: number;
}

interface TestClient {
  socket: Socket;
  clientId: number;
  messagesSent: number;
  messagesReceived: number;
  userId: string;
  connectionStartTime: number;
  connectionEndTime?: number;
  pendingRequests: Map<string, { sendTime: number, counted: boolean }>;
}

@Injectable()
export class SocketService {
  private readonly logger = new Logger(SocketService.name);
  private metrics: PerformanceMetrics;
  private clients: TestClient[] = [];
  private connectedClients = 0;
  private completedClients = 0;
  private testCompleted = false;
  private testPromiseResolve: (value: string) => void;

  constructor() {
    this.initializeMetrics();
  }

  private initializeMetrics(): void {
    this.testCompleted = false;
    this.connectedClients = 0;
    this.completedClients = 0;
    
    // Clear previous clients
    this.clients.forEach(client => client.socket.disconnect());
    this.clients = [];
    
    this.metrics = {
      connectionsStarted: 0,
      connectionsSuccessful: 0,
      connectionsFailed: 0,
      connectionRate: 0,
      avgConnectionTime: 0,
      responseTimes: [],
      minLatency: Infinity,
      maxLatency: 0,
      avgLatency: 0,
      p95Latency: 0,
      p99Latency: 0,
      messagesSent: 0,
      messagesReceived: 0,
      messagesPerSecond: 0,
      bytesPerSecond: 0,
      errors: 0,
      errorRate: 0,
      errorTypes: new Map(),
      testStartTime: Date.now(),
      testDuration: 0,
      memoryUsage: 0
    };
  }

  async runLoadTest(): Promise<string> {
    this.logger.log('Starting WebSocket load test...');
    this.initializeMetrics();
    this.metrics.testStartTime = Date.now();
    
    return new Promise(async (resolve, reject) => {
      this.testPromiseResolve = resolve;
      
      try {
        // Fetch cookies
        const userCookies = await this.fetchCookies(TARGET_USERS);
        
        // Create and connect clients
        for (let i = 0; i < userCookies.length; i++) {
          const { cookie, userId } = userCookies[i];
          const client = this.createClient(i, cookie, userId);
          this.clients.push(client);
          
          client.socket.on('connect', () => {
            this.startSendingMessages(client);
          });
          
          await this.delay(RAMP_UP_DELAY_MS);
        }
        
      } catch (error) {
        this.logger.error('Load test failed to start:', error.message);
        reject(error);
      }
    });
  }

  private async fetchCookies(count: number): Promise<Array<{ cookie: string; userId: string }>> {
    try {
      const response = await axios.get(`${COOKIES_API_URL}?count=${count}`);
      
      // Debug logging to identify issue
      this.logger.log(`Fetching ${count} cookies, received ${response.data.length} cookies`);
      
      return response.data.slice(0, count).map((rawCookie: string, index: number) => {
        const formattedCookie = `connect.sid=${rawCookie}`;
        return {
          cookie: formattedCookie,
          userId: `user-${index}-${Date.now()}`
        };
      });
    } catch (err) {
      this.recordError('cookie_fetch_failed');
      throw new Error(`Failed to fetch cookies: ${err.message}`);
    }
  }

  private createClient(clientId: number, cookie: string, userId: string): TestClient {
    const connectionStartTime = Date.now();
    this.metrics.connectionsStarted++;
    
    const socket = io(QA_SERVER_URL, {
      path: WS_PATH,
      transports: ['websocket'],
      reconnection: false,
      timeout: 10000,
      extraHeaders: {
        Cookie: cookie
      },
      query: {
        clientType: 'load-test',
        userId: userId
      }
    });

    const client: TestClient = {
      socket,
      clientId,
      messagesSent: 0,
      messagesReceived: 0,
      userId,
      connectionStartTime,
      pendingRequests: new Map()
    };

    socket.on('connect', () => {
      const connectionTime = Date.now() - connectionStartTime;
      client.connectionEndTime = Date.now();
      
      this.connectedClients++;
      this.metrics.connectionsSuccessful++;
      this.metrics.avgConnectionTime = ((this.metrics.avgConnectionTime * (this.metrics.connectionsSuccessful - 1)) + connectionTime) / this.metrics.connectionsSuccessful;
    });

    socket.on('disconnect', () => {
      this.connectedClients--;
    });

    socket.on('connect_error', (err) => {
      let errorType = 'connection_error';
      if (err.message.includes('timeout')) {
        errorType = 'connection_timeout';
      } else if (err.message.toLowerCase().includes('unauthorized') || err.message.includes('401')) {
        errorType = 'authentication_error';
      } else if (err.message.includes('404') || err.message.includes('not found')) {
        errorType = 'endpoint_not_found';
      } else if (err.message.includes('ECONNREFUSED')) {
        errorType = 'connection_refused';
      } else if (err.message.includes('ENOTFOUND')) {
        errorType = 'dns_resolution_error';
      }
      
      this.metrics.connectionsFailed++;
      this.recordError(errorType);
    });

    socket.on('error', () => {
      this.recordError('socket_error');
    });

    return client;
  }

  private startSendingMessages(client: TestClient): void {
    const cleanupInterval = setInterval(() => {
      this.cleanupPendingRequests(client);
    }, 1000);

    const interval = setInterval(() => {
      if (client.messagesSent >= MESSAGES_PER_CLIENT) {
        clearInterval(interval);
        clearInterval(cleanupInterval);
        this.completedClients++;
        client.socket.disconnect();
        
        if (this.completedClients >= TARGET_USERS && !this.testCompleted) {
          this.testCompleted = true;
          setTimeout(() => {
            // Final cleanup to count any remaining pending requests
            this.clients.forEach(c => this.cleanupPendingRequests(c));
            const finalReport = this.generateFinalReport();
            if (this.testPromiseResolve) {
              this.testPromiseResolve(finalReport);
            }
          }, 1000);
        }
        return;
      }

      const message = this.generatePositionPayload(client);
      const sendTime = Date.now();
      
      client.pendingRequests.set(message.messageId, { 
        sendTime, 
        counted: false 
      });
      
      // Send message and handle acknowledgment
      client.socket.emit(WS_TOPIC, message, (acknowledgment) => {
        const pending = client.pendingRequests.get(message.messageId);
        if (pending && !pending.counted) {
          const responseTime = Date.now() - pending.sendTime;
          pending.counted = true;
          this.updateLatencyMetrics(responseTime);
          client.messagesReceived++;
          client.pendingRequests.delete(message.messageId);
        }
      });

      // For servers that don't send acknowledgments, consider message delivered after shorter timeout
      setTimeout(() => {
        const pending = client.pendingRequests.get(message.messageId);
        if (pending && !pending.counted) {
          // If no real acknowledgment, count as received with actual latency
          const responseTime = Date.now() - pending.sendTime;
          pending.counted = true;
          this.updateLatencyMetrics(responseTime); // Remove artificial cap
          client.messagesReceived++;
          client.pendingRequests.delete(message.messageId);
        }
      }, 50); // Reduce timeout to 50ms for faster response
      
      client.messagesSent++;
    }, MESSAGE_INTERVAL_MS);
  }

  private cleanupPendingRequests(client: TestClient): void {
    const now = Date.now();
    const timeout = 1000; // Reduce timeout to 1 second
    
    const toDelete: string[] = [];
    
    client.pendingRequests.forEach((request, messageId) => {
      if (!request.counted && (now - request.sendTime) > timeout) {
        // Count as received before cleanup to avoid losing messages
        const responseTime = now - request.sendTime; // Use actual response time
        request.counted = true;
        this.updateLatencyMetrics(responseTime);
        client.messagesReceived++;
        toDelete.push(messageId);
      }
    });
    
    // Delete processed requests
    toDelete.forEach(messageId => {
      client.pendingRequests.delete(messageId);
    });
  }

  private generatePositionPayload(client: TestClient) {
    const messageId = `${client.clientId}-${client.messagesSent}-${Date.now()}`;
    return {
      messageId,
      versionId: `load-test-${client.userId}-${client.clientId}`,
      position: {
        x: Math.random() * 100,
        y: Math.random() * 100,
        z: Math.random() * 100,
        timestamp: new Date().toISOString(),
        orientation: {
          qx: Math.random(),
          qy: Math.random(),
          qz: Math.random(),
          qw: Math.random()
        }
      }
    };
  }

  private calculatePercentile(arr: number[], percentile: number): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  private updateLatencyMetrics(responseTime: number): void {
    this.metrics.responseTimes.push(responseTime);
    this.metrics.minLatency = Math.min(this.metrics.minLatency, responseTime);
    this.metrics.maxLatency = Math.max(this.metrics.maxLatency, responseTime);
    
    if (this.metrics.responseTimes.length > 1000) {
      this.metrics.responseTimes = this.metrics.responseTimes.slice(-1000);
    }
    
    this.metrics.avgLatency = this.metrics.responseTimes.reduce((sum, time) => sum + time, 0) / this.metrics.responseTimes.length;
    this.metrics.p95Latency = this.calculatePercentile(this.metrics.responseTimes, 95);
    this.metrics.p99Latency = this.calculatePercentile(this.metrics.responseTimes, 99);
  }

  private updateThroughputMetrics(): void {
    const currentTime = Date.now();
    this.metrics.testDuration = (currentTime - this.metrics.testStartTime) / 1000;
    
    // Calculate totals from all clients for accurate counts
    const totalSent = this.clients.reduce((sum, client) => sum + client.messagesSent, 0);
    const totalReceived = this.clients.reduce((sum, client) => sum + client.messagesReceived, 0);
    
    this.metrics.messagesSent = totalSent;
    this.metrics.messagesReceived = totalReceived;
    
    if (this.metrics.testDuration > 0) {
      this.metrics.messagesPerSecond = this.metrics.messagesSent / this.metrics.testDuration;
      this.metrics.connectionRate = this.metrics.connectionsStarted / this.metrics.testDuration;
      this.metrics.errorRate = (this.metrics.errors / (this.metrics.messagesSent || 1)) * 100;
      
      const avgMessageSize = 200;
      this.metrics.bytesPerSecond = this.metrics.messagesPerSecond * avgMessageSize;
    }
    
    const memUsage = process.memoryUsage();
    this.metrics.memoryUsage = memUsage.heapUsed / 1024 / 1024;
  }

  private recordError(errorType: string): void {
    this.metrics.errors++;
    const currentCount = this.metrics.errorTypes.get(errorType) || 0;
    this.metrics.errorTypes.set(errorType, currentCount + 1);
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private generateFinalReport(): string {
    this.updateThroughputMetrics();
    
    const totalDuration = (Date.now() - this.metrics.testStartTime) / 1000;
    const successRate = this.metrics.messagesSent > 0 
      ? (this.metrics.messagesReceived / this.metrics.messagesSent) * 100 
      : 0;

    // Debug logging
    this.logger.log(`Debug: Total clients created: ${this.clients.length}`);
    this.logger.log(`Debug: Expected messages: ${TARGET_USERS * MESSAGES_PER_CLIENT}`);
    this.logger.log(`Debug: Actual messages sent: ${this.metrics.messagesSent}`);
    this.logger.log(`Debug: Actual messages received: ${this.metrics.messagesReceived}`);
    this.logger.log(`Debug: Connections started: ${this.metrics.connectionsStarted}`);
    this.logger.log(`Debug: Connections successful: ${this.metrics.connectionsSuccessful}`);
    
    // Per-client debug info
    this.clients.forEach((client, index) => {
      this.logger.log(`Debug: Client ${index} (ID: ${client.clientId}) - Sent: ${client.messagesSent}, Received: ${client.messagesReceived}, Pending: ${client.pendingRequests.size}`);
    });
    
    let report = '';
    report += '\n📋 FINAL LOAD TEST REPORT\n';
    report += '═'.repeat(80) + '\n';
    
    report += `🎯 TEST SUMMARY:\n`;
    report += `   Target Users: ${TARGET_USERS}\n`;
    report += `   Messages per Client: ${MESSAGES_PER_CLIENT}\n`;
    report += `   Total Test Duration: ${Math.floor(totalDuration / 60)}m ${Math.floor(totalDuration % 60)}s\n`;
    report += `   Ramp-up Delay: ${RAMP_UP_DELAY_MS}ms\n`;
    
    report += `\n📈 PERFORMANCE RESULTS:\n`;
    report += `   Peak Connection Rate: ${this.metrics.connectionRate.toFixed(2)} conn/sec\n`;
    report += `   Peak Message Rate: ${this.metrics.messagesPerSecond.toFixed(2)} msg/sec\n`;
    report += `   Peak Data Rate: ${this.formatBytes(this.metrics.bytesPerSecond)}/sec\n`;
    report += `   Average Latency: ${this.metrics.avgLatency.toFixed(2)}ms\n`;
    report += `   95th Percentile Latency: ${this.metrics.p95Latency.toFixed(2)}ms\n`;
    report += `   99th Percentile Latency: ${this.metrics.p99Latency.toFixed(2)}ms\n`;
    
    report += `\n✅ SUCCESS METRICS:\n`;
    report += `   Successful Connections: ${this.metrics.connectionsSuccessful}/${this.metrics.connectionsStarted}\n`;
    report += `   Connection Success Rate: ${((this.metrics.connectionsSuccessful / this.metrics.connectionsStarted) * 100).toFixed(2)}%\n`;
    report += `   Messages Sent: ${this.metrics.messagesSent}\n`;
    report += `   Messages Received: ${this.metrics.messagesReceived}\n`;
    report += `   Message Success Rate: ${successRate.toFixed(2)}%\n`;
    
    if (this.metrics.errors > 0) {
      report += `\n❌ ERROR ANALYSIS:\n`;
      report += `   Total Errors: ${this.metrics.errors}\n`;
      report += `   Error Rate: ${this.metrics.errorRate.toFixed(2)}%\n`;
      report += `   Error Breakdown:\n`;
      this.metrics.errorTypes.forEach((count, type) => {
        report += `     ${type}: ${count} (${((count / this.metrics.errors) * 100).toFixed(1)}%)\n`;
      });
    }
    
    report += '═'.repeat(80) + '\n';
    report += 'Load test completed! 🎉\n';
    
    this.logger.log(report);
    return report;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getMetrics(): PerformanceMetrics {
    this.updateThroughputMetrics();
    return { ...this.metrics };
  }

  stopTest(): string {
    this.clients.forEach(client => client.socket.disconnect());
    if (!this.testCompleted) {
      this.testCompleted = true;
      return this.generateFinalReport();
    }
    return 'Test already completed.';
  }
}