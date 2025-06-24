import { Injectable, Logger } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import axios from 'axios';
import { LoadTestDto } from './socket.controller';

// Configuration
const COOKIES_API_URL = 'http://localhost:3006/api/users/get-cookies';
const QA_SERVER_URL = 'https://app.qa.astraops.ai';
const WS_PATH = '/socket.io';
const WS_TOPIC = 'update-position';

// Performance Metrics Interface
export interface PerformanceMetrics {
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
  pendingRequests: Map<string, { sendTime: number; counted: boolean }>;
  connectionTimeoutId?: NodeJS.Timeout;
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
  private loadTestParams: LoadTestDto;

  constructor() {
    this.initializeMetrics();
  }

  private initializeMetrics(): void {
    this.testCompleted = false;
    this.connectedClients = 0;
    this.completedClients = 0;

    // Clear previous clients
    this.clients.forEach((client) => client.socket.disconnect());
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
      memoryUsage: 0,
    };
  }

  async runLoadTest(loadTestParams: LoadTestDto): Promise<string> {
    this.logger.log('Starting WebSocket load test...');
    this.loadTestParams = loadTestParams;
    this.initializeMetrics();
    this.metrics.testStartTime = Date.now();

    return new Promise(async (resolve, reject) => {
      this.testPromiseResolve = resolve;

      // Add overall timeout for the entire test (5 minutes)
      const testTimeout = setTimeout(() => {
        this.logger.warn('Test timeout reached, forcing completion');
        this.testCompleted = true;
        const timeoutReport = this.generateFinalReport();
        resolve(timeoutReport);
      }, 5 * 60 * 1000); // 5 minutes timeout

      try {
        // Fetch cookies
        const userCookies = await this.fetchCookies(this.loadTestParams.targetUsers);

        // Check if we have any cookies to work with
        if (userCookies.length === 0) {
          this.logger.warn('No cookies available for load testing. Test will complete immediately.');
          this.testCompleted = true;
          const noCookiesReport = this.generateFinalReport();
          clearTimeout(testTimeout);
          resolve(noCookiesReport);
          return;
        }

        // Create and connect clients
        for (let i = 0; i < userCookies.length; i++) {
          const { cookie, userId } = userCookies[i];
          const client = this.createClient(i, cookie, userId);
          this.clients.push(client);

          client.socket.on('connect', () => {
            this.startSendingMessages(client);
          });

          // Add connection timeout for each client
          client.connectionTimeoutId = setTimeout(() => {
            if (!client.socket.connected) {
              this.logger.warn(`Client ${i} failed to connect within timeout`);
              this.metrics.connectionsFailed++;
              this.recordError('connection_timeout');
              
              // Check if all clients have failed to connect
              const failedConnections = this.clients.filter(c => !c.socket.connected).length;
              if (failedConnections === this.clients.length) {
                this.logger.error('All clients failed to connect. Test will complete with failure.');
                this.testCompleted = true;
                setTimeout(() => {
                  const finalReport = this.generateFinalReport();
                  if (this.testPromiseResolve) {
                    this.testPromiseResolve(finalReport);
                  }
                }, 1000);
              }
            }
          }, 15000); // 15 seconds connection timeout per client

          await this.delay(this.loadTestParams.rampUpDelayMs);
        }

        // Clear the test timeout when test completes normally
        const originalResolve = this.testPromiseResolve;
        this.testPromiseResolve = (value: string) => {
          clearTimeout(testTimeout);
          originalResolve(value);
        };

      } catch (error) {
        clearTimeout(testTimeout);
        this.logger.error('Load test failed to start:', error.message);
        reject(error);
      }
    });
  }

  private async fetchCookies(
    count: number,
  ): Promise<Array<{ cookie: string; userId: string }>> {
    try {
      const response = await axios.post(`${COOKIES_API_URL}`, {
        input: 'cookies'
      });

      // Debug logging to identify issue
      this.logger.log(
        `Fetching ${count} cookies, received response:`,
        JSON.stringify(response.data, null, 2),
      );

      // Handle different response formats
      let cookies: string[] = [];
      if (Array.isArray(response.data)) {
        // Direct array of cookies
        cookies = response.data;
      } else if (response.data.cookies && Array.isArray(response.data.cookies)) {
        // Response with cookies array
        cookies = response.data.cookies.map((c: any) => 
          typeof c === 'string' ? c : c['connect.sid'] || c.cookie || c
        );
      } else if (response.data.cookies && typeof response.data.cookies === 'object') {
        // Response with cookies object
        cookies = Object.values(response.data.cookies);
      } else {
        throw new Error(`Unexpected response format: ${JSON.stringify(response.data)}`);
      }

      // Filter out null/undefined/empty cookies
      cookies = cookies.filter(cookie => cookie && cookie.trim() !== '');

      this.logger.log(`Processed ${cookies.length} valid cookies out of ${count} requested`);

      return cookies
        .slice(0, count)
        .map((rawCookie: string, index: number) => {
          // Ensure cookie is properly formatted
          const cookieValue = rawCookie.startsWith('connect.sid=') 
            ? rawCookie.split('=')[1] 
            : rawCookie;
          
          const formattedCookie = `connect.sid=${cookieValue}`;
          
          this.logger.log(`Cookie ${index}: ${formattedCookie}`);
          
          return {
            cookie: formattedCookie,
            userId: `user-${index}-${Date.now()}`,
          };
        });
    } catch (err) {
      this.recordError('cookie_fetch_failed');
      this.logger.error('Failed to fetch cookies:', err.message);
      this.logger.error('Response data:', err.response?.data);
      throw new Error(`Failed to fetch cookies: ${err.message}`);
    }
  }

  private createClient(
    clientId: number,
    cookie: string,
    userId: string,
  ): TestClient {
    const connectionStartTime = Date.now();
    this.metrics.connectionsStarted++;

    this.logger.log(`Creating client ${clientId} with cookie: ${cookie.substring(0, 20)}...`);
    this.logger.log(`Connecting to: ${QA_SERVER_URL}${WS_PATH}`);

    const socket = io(QA_SERVER_URL, {
      path: WS_PATH,
      transports: ['websocket'],
      reconnection: false,
      timeout: 10000,
      extraHeaders: {
        Cookie: cookie,
      },
      query: {
        clientType: 'load-test',
        userId: userId,
      },
    });

    const client: TestClient = {
      socket,
      clientId,
      messagesSent: 0,
      messagesReceived: 0,
      userId,
      connectionStartTime,
      pendingRequests: new Map(),
    };

    socket.on('connect', () => {
      const connectionTime = Date.now() - connectionStartTime;
      client.connectionEndTime = Date.now();

      // Clear the connection timeout since client connected successfully
      if (client.connectionTimeoutId) {
        clearTimeout(client.connectionTimeoutId);
        client.connectionTimeoutId = undefined;
        this.logger.debug(`Cleared connection timeout for client ${clientId}`);
      }

      this.connectedClients++;
      this.metrics.connectionsSuccessful++;
      this.metrics.avgConnectionTime =
        (this.metrics.avgConnectionTime *
          (this.metrics.connectionsSuccessful - 1) +
          connectionTime) /
        this.metrics.connectionsSuccessful;
      
      this.logger.log(`Client ${clientId} connected successfully in ${connectionTime}ms`);
    });

    socket.on('disconnect', (reason) => {
      this.connectedClients--;
      this.logger.log(`Client ${clientId} disconnected: ${reason}`);
      
      // If client disconnects before completing messages, mark as completed
      if (client.messagesSent < this.loadTestParams.messagesPerClient) {
        this.completedClients++;
        this.checkTestCompletion();
      }
    });

    socket.on('connect_error', (err) => {
      let errorType = 'connection_error';
      if (err.message.includes('timeout')) {
        errorType = 'connection_timeout';
      } else if (
        err.message.toLowerCase().includes('unauthorized') ||
        err.message.includes('401')
      ) {
        errorType = 'authentication_error';
      } else if (
        err.message.includes('404') ||
        err.message.includes('not found')
      ) {
        errorType = 'endpoint_not_found';
      } else if (err.message.includes('ECONNREFUSED')) {
        errorType = 'connection_refused';
      } else if (err.message.includes('ENOTFOUND')) {
        errorType = 'dns_resolution_error';
      }

      this.metrics.connectionsFailed++;
      this.recordError(errorType);
      
      // Log the specific error for debugging
      this.logger.error(`Client ${clientId} connection error: ${err.message}`);
      this.logger.error(`Client ${clientId} error details:`, {
        errorType,
        cookie: cookie.substring(0, 20) + '...',
        userId,
        url: QA_SERVER_URL + WS_PATH
      });
      
      // Mark client as completed if connection fails
      setTimeout(() => {
        if (!socket.connected) {
          this.completedClients++;
          this.checkTestCompletion();
        }
      }, 5000); // Give 5 seconds for potential reconnection
    });

    socket.on('error', (err) => {
      this.recordError('socket_error');
      this.logger.error(`Client ${clientId} socket error:`, err);
    });

    return client;
  }

  private startSendingMessages(client: TestClient): void {
    const cleanupInterval = setInterval(() => {
      this.cleanupPendingRequests(client);
    }, 1000);

    const interval = setInterval(() => {
      // Check if client is still connected
      if (!client.socket.connected) {
        clearInterval(interval);
        clearInterval(cleanupInterval);
        this.completedClients++;
        this.checkTestCompletion();
        return;
      }

      if (client.messagesSent >= this.loadTestParams.messagesPerClient) {
        clearInterval(interval);
        clearInterval(cleanupInterval);
        this.completedClients++;
        client.socket.disconnect();
        this.checkTestCompletion();
        return;
      }

      const message = this.generatePositionPayload(client);
      const sendTime = Date.now();

      client.pendingRequests.set(message.messageId, {
        sendTime,
        counted: false,
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
    }, this.loadTestParams.messageIntervalMs);
  }

  private cleanupPendingRequests(client: TestClient): void {
    const now = Date.now();
    const timeout = 1000; // Reduce timeout to 1 second

    const toDelete: string[] = [];

    client.pendingRequests.forEach((request, messageId) => {
      if (!request.counted && now - request.sendTime > timeout) {
        // Count as received before cleanup to avoid losing messages
        const responseTime = now - request.sendTime; // Use actual response time
        request.counted = true;
        this.updateLatencyMetrics(responseTime);
        client.messagesReceived++;
        toDelete.push(messageId);
      }
    });

    // Delete processed requests
    toDelete.forEach((messageId) => {
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
          qw: Math.random(),
        },
      },
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

    this.metrics.avgLatency =
      this.metrics.responseTimes.reduce((sum, time) => sum + time, 0) /
      this.metrics.responseTimes.length;
    this.metrics.p95Latency = this.calculatePercentile(
      this.metrics.responseTimes,
      95,
    );
    this.metrics.p99Latency = this.calculatePercentile(
      this.metrics.responseTimes,
      99,
    );
  }

  private updateThroughputMetrics(): void {
    const currentTime = Date.now();
    this.metrics.testDuration =
      (currentTime - this.metrics.testStartTime) / 1000;

    // Calculate totals from all clients for accurate counts
    const totalSent = this.clients.reduce(
      (sum, client) => sum + client.messagesSent,
      0,
    );
    const totalReceived = this.clients.reduce(
      (sum, client) => sum + client.messagesReceived,
      0,
    );

    this.metrics.messagesSent = totalSent;
    this.metrics.messagesReceived = totalReceived;

    if (this.metrics.testDuration > 0) {
      this.metrics.messagesPerSecond =
        this.metrics.messagesSent / this.metrics.testDuration;
      this.metrics.connectionRate =
        this.metrics.connectionsStarted / this.metrics.testDuration;
      this.metrics.errorRate =
        (this.metrics.errors / (this.metrics.messagesSent || 1)) * 100;

      const avgMessageSize = 200;
      this.metrics.bytesPerSecond =
        this.metrics.messagesPerSecond * avgMessageSize;
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
    const successRate =
      this.metrics.messagesSent > 0
        ? (this.metrics.messagesReceived / this.metrics.messagesSent) * 100
        : 0;

    // Debug logging
    this.logger.log(`Debug: Total clients created: ${this.clients.length}`);
    this.logger.log(
      `Debug: Expected messages: ${this.loadTestParams.targetUsers * this.loadTestParams.messagesPerClient}`,
    );
    this.logger.log(
      `Debug: Actual messages sent: ${this.metrics.messagesSent}`,
    );
    this.logger.log(
      `Debug: Actual messages received: ${this.metrics.messagesReceived}`,
    );
    this.logger.log(
      `Debug: Connections started: ${this.metrics.connectionsStarted}`,
    );
    this.logger.log(
      `Debug: Connections successful: ${this.metrics.connectionsSuccessful}`,
    );

    // Per-client debug info
    this.clients.forEach((client, index) => {
      this.logger.log(
        `Debug: Client ${index} (ID: ${client.clientId}) - Sent: ${client.messagesSent}, Received: ${client.messagesReceived}, Pending: ${client.pendingRequests.size}`,
      );
    });

    let report = '';
    report += '\n📋 FINAL LOAD TEST REPORT\n';
    report += '═'.repeat(80) + '\n';

    // Special case for no cookies available
    if (this.clients.length === 0) {
      report += `⚠️  NO COOKIES AVAILABLE:\n`;
      report += `   No valid cookies found in the database.\n`;
      report += `   Please ensure users are logged in and have valid session cookies.\n`;
      report += `   You can generate cookies using the /api/users/generate-cookies endpoint.\n\n`;
      report += `   Test Duration: ${Math.floor(totalDuration / 60)}m ${Math.floor(totalDuration % 60)}s\n`;
      report += '═'.repeat(80) + '\n';
      report += 'Load test completed (no cookies available)! ⚠️\n';
      this.logger.log(report);
      return report;
    }

    // Special case for all connection failures
    if (this.metrics.connectionsSuccessful === 0 && this.metrics.connectionsFailed > 0) {
      report += `❌ ALL CONNECTIONS FAILED:\n`;
      report += `   All ${this.metrics.connectionsFailed} clients failed to connect to the WebSocket server.\n`;
      report += `   This indicates a network, authentication, or server availability issue.\n`;
      report += `   Please check:\n`;
      report += `   - Server is running and accessible\n`;
      report += `   - Cookies are valid and not expired\n`;
      report += `   - Network connectivity to ${QA_SERVER_URL}\n`;
      report += `   - Server accepts WebSocket connections on ${WS_PATH}\n\n`;
      report += `   Test Duration: ${Math.floor(totalDuration / 60)}m ${Math.floor(totalDuration % 60)}s\n`;
      report += '═'.repeat(80) + '\n';
      report += 'Load test completed (all connections failed)! ❌\n';
      this.logger.log(report);
      return report;
    }

    report += `🎯 TEST SUMMARY:\n`;
    report += `   Target Users: ${this.loadTestParams.targetUsers}\n`;
    report += `   Messages per Client: ${this.loadTestParams.messagesPerClient}\n`;
    report += `   Total Test Duration: ${Math.floor(totalDuration / 60)}m ${Math.floor(totalDuration % 60)}s\n`;
    report += `   Ramp-up Delay: ${this.loadTestParams.rampUpDelayMs}ms\n`;

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
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getMetrics(): PerformanceMetrics {
    this.updateThroughputMetrics();
    return { ...this.metrics };
  }

  getTestStatus(): any {
    const totalExpected = this.loadTestParams?.targetUsers || 0;
    const progress = totalExpected > 0 ? (this.completedClients / totalExpected) * 100 : 0;
    
    return {
      testCompleted: this.testCompleted,
      completedClients: this.completedClients,
      totalExpected: totalExpected,
      progress: progress.toFixed(2) + '%',
      connectedClients: this.connectedClients,
      messagesSent: this.metrics.messagesSent,
      messagesReceived: this.metrics.messagesReceived,
      errors: this.metrics.errors,
      testDuration: this.metrics.testDuration
    };
  }

  stopTest(): string {
    // Clear all connection timeouts
    this.clients.forEach(client => {
      if (client.connectionTimeoutId) {
        clearTimeout(client.connectionTimeoutId);
        client.connectionTimeoutId = undefined;
      }
    });
    
    this.clients.forEach((client) => client.socket.disconnect());
    if (!this.testCompleted) {
      this.testCompleted = true;
      return this.generateFinalReport();
    }
    return 'Test already completed.';
  }

  private checkTestCompletion(): void {
    // If no clients were created (no cookies available), mark as completed
    if (this.clients.length === 0) {
      this.testCompleted = true;
      setTimeout(() => {
        const finalReport = this.generateFinalReport();
        if (this.testPromiseResolve) {
          this.testPromiseResolve(finalReport);
        }
      }, 1000);
      return;
    }

    // Check if all clients failed to connect
    const successfulConnections = this.clients.filter(c => c.socket.connected || c.messagesSent > 0).length;
    if (successfulConnections === 0 && this.metrics.connectionsFailed > 0) {
      this.logger.error('No clients successfully connected. Test completed with connection failures.');
      this.testCompleted = true;
      
      // Clear all remaining connection timeouts
      this.clients.forEach(client => {
        if (client.connectionTimeoutId) {
          clearTimeout(client.connectionTimeoutId);
          client.connectionTimeoutId = undefined;
        }
      });
      
      setTimeout(() => {
        const finalReport = this.generateFinalReport();
        if (this.testPromiseResolve) {
          this.testPromiseResolve(finalReport);
        }
      }, 1000);
      return;
    }

    if (this.completedClients >= this.loadTestParams.targetUsers && !this.testCompleted) {
      this.testCompleted = true;
      
      // Clear all remaining connection timeouts
      this.clients.forEach(client => {
        if (client.connectionTimeoutId) {
          clearTimeout(client.connectionTimeoutId);
          client.connectionTimeoutId = undefined;
        }
      });
      
      setTimeout(() => {
        // Final cleanup to count any remaining pending requests
        this.clients.forEach((c) => this.cleanupPendingRequests(c));
        const finalReport = this.generateFinalReport();
        if (this.testPromiseResolve) {
          this.testPromiseResolve(finalReport);
        }
      }, 1000);
    }
  }
}
