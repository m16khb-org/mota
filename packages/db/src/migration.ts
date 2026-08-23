import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { createDatabase } from "./client";

export async function migrateDatabase(
  database: ReturnType<typeof createDatabase>["database"],
  migrationsFolder: string,
) {
  await migrate(database, { migrationsFolder });
}
