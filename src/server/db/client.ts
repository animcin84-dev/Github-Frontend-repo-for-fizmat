import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "@/server/db/schema";

let sqlClient: Sql | undefined;
let database: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required when SUPPORT_DATA_MODE=database");
  return url;
}

export function getSqlClient() {
  if (!sqlClient) {
    sqlClient = postgres(getDatabaseUrl(), {
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return sqlClient;
}

export function getDb() {
  if (!database) database = drizzle(getSqlClient(), { schema });
  return database;
}

export async function closeDatabase() {
  if (sqlClient) await sqlClient.end({ timeout: 5 });
  sqlClient = undefined;
  database = undefined;
}

export type Database = ReturnType<typeof getDb>;
