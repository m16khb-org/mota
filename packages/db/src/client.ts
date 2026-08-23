import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function createDatabase(databaseUrl: string) {
  const client = postgres(databaseUrl, {
    max: 5,
    prepare: false,
  });
  return {
    client,
    database: drizzle(client, { schema }),
  } as const;
}
