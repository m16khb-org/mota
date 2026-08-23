import { createDatabase } from "./client";
import { migrateDatabase } from "./migration";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }
  const { client, database } = createDatabase(databaseUrl);
  try {
    await migrateDatabase(database, "./drizzle");
  } finally {
    await client.end();
  }
}

void main();
