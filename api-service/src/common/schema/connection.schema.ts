import { Model, Mongoose } from "mongoose";
import { z } from "zod";



export const MongooseConnectionStatus = z.enum(["connected", "disconnected"]);
export type MongooseConnectionStatusType = z.infer<typeof MongooseConnectionStatus>;

export const MongooseConnectionSchema = z.discriminatedUnion("status",[
    z.object({
        status:z.literal(MongooseConnectionStatus.enum.connected),
        connection:z.instanceof(Mongoose),
    }),
    z.object({
        status:z.literal(MongooseConnectionStatus.enum.disconnected),
        connection:z.null(),
    })
]);

export type MongooseConnectionType = z.infer<typeof MongooseConnectionSchema>;

export const MongooseModelSchema = z.discriminatedUnion('status',[
    z.object({
        status:z.literal(MongooseConnectionStatus.enum.connected),
        connected:z.instanceof(Model),
    }),
    z.object({
        status:z.literal(MongooseConnectionStatus.enum.disconnected),
        connection:z.null()
    })
]);

export type MongooseModelType = z.infer<typeof MongooseModelSchema>;