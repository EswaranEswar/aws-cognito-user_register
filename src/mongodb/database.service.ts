import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  MongooseConnectionStatus,
  MongooseConnectionStatusType,
  MongooseConnectionType,
} from '../common/schema/connection.schema';
import mongoose, { connection, Model, Schema } from 'mongoose';
import { AppConfigService } from '../config/config.service';

@Injectable()
export class DatabaseService implements OnModuleInit {
  mongooseConnection: MongooseConnectionType;
  private logger = new Logger(DatabaseService.name);

  constructor(private config: AppConfigService) {
    this.mongooseConnection = {
      status: MongooseConnectionStatus.enum.disconnected,
      connection: null,
    };
  }

  async onModuleInit() {
    await this.connect();
  }

  private setUpListners(db: mongoose.Connection) {
    db.on('connected', () => {
      try {
        this.logger.log('MongoDB Connected');
      } catch (err) {
        this.logger.log(
          `Failed to delete interval retry-mongodb-connection:${err}`,
        );
      }
    });
  }

  async connect(): Promise<MongooseConnectionType> {
    const dbUrl = this.config.mongoUrl;
    this.logger.log(`Connecting to....`);
    try {
      if (
        this.mongooseConnection.status ===
        MongooseConnectionStatus.enum.connected
      ) {
        return this.mongooseConnection;
      } else {
        this.mongooseConnection = {
          status: MongooseConnectionStatus.enum.connected,
          connection: await mongoose.connect(dbUrl),
        };
      }
      this.logger.log(`Connected to the DB`);
      this.setUpListners(this.mongooseConnection.connection.connection);
    } catch (err) {
      this.logger.error(`Failed to connect to database: ${err}`);
      this.mongooseConnection = {
        status: MongooseConnectionStatus.enum.disconnected,
        connection: null,
      };
    }
    return this.mongooseConnection;
  }

  async disconnect(): Promise<MongooseConnectionStatusType> {
    this.logger.log('DB is disconnecting...');

    if (
      this.mongooseConnection.status === MongooseConnectionStatus.enum.connected
    ) {
      await this.mongooseConnection.connection.disconnect();
    }
    this.mongooseConnection = {
      status: MongooseConnectionStatus.enum.disconnected,
      connection: null,
    };
    this.logger.log('Database disconnected successfully');
    return this.mongooseConnection.status;
  }

  async getModel(modelDefenition: {
    name: string;
    schema: Schema;
  }): Promise<Model<any>> {
    const model = connection.model(
      modelDefenition.name,
      modelDefenition.schema,
    );
    return model;
  }

  async status(): Promise<MongooseConnectionStatusType> {
    return this.mongooseConnection.status;
  }
}
