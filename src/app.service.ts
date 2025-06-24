import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DatabaseService } from './mongodb/database.service';
import { MongooseConnectionStatusType } from './common/schema/connection.schema';

@Injectable()
export class AppService {
  constructor(private readonly databaseService: DatabaseService) {}

  getStatus(): Promise<MongooseConnectionStatusType> {
    return this.databaseService.status();
  }

  async getCollectionNames(): Promise<string[]> {
    try {
      const connection = await this.databaseService.connect();
      if (connection.status === 'connected' && connection.connection) {
        const collections = await connection.connection.connection.db
          .listCollections()
          .toArray();
        return collections.map((collection) => collection.name);
      }
      throw new Error('Database not connected');
    } catch (error) {
      throw new HttpException(
        `Failed to get collection names: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async deleteCollections(collections: string[]): Promise<{ message: string }> {
    try {
      const connection = await this.databaseService.connect();
      if (connection.status !== 'connected' || !connection.connection) {
        throw new Error('Database not connected');
      }

      const db = connection.connection.connection.db;
      for (const collection of collections) {
        try {
          const result = await db.collection(collection).drop();
          if (result) {
            console.log(`Collection "${collection}" deleted successfully.`);
          }
        } catch (error) {
          if (error.codeName === 'NamespaceNotFound') {
            console.log(`⚠️ Collection "${collection}" does not exist.`);
          } else {
            console.error(
              `Error deleting collection "${collection}":`,
              error.message,
            );
          }
        }
      }
      return {
        message: `Attempted to delete ${collections.length} collection(s)`,
      };
    } catch (error) {
      throw new HttpException(
        `Failed to delete collections: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
