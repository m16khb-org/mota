import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import {
  createDatabase,
  DrizzleUserSettingsRepository,
  migrateDatabase,
} from "@mota/db";
import { AppModule } from "./app.module";
import { loadEnv } from "./config/env";

async function bootstrap() {
  const env = loadEnv();
  const { client, database } = createDatabase(env.databaseUrl);
  await migrateDatabase(database, env.migrationsPath);
  const repository = new DrizzleUserSettingsRepository(database);
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register({
      settingsRepository: repository,
      subwayArrivalUpstream: env.subwayArrivalUpstream,
      transitCatalogRefreshMs: env.transitCatalogRefreshMs,
      warmTransitCatalogs: true,
      minimumBusCatalogItems: 10_000,
      minimumSubwayCatalogItems: 100,
      oauthConfig: {
        supabaseUrl: env.oauth.supabaseUrl,
        anonKey: env.oauth.anonKey,
        publicUrl: env.oauth.publicUrl,
        fetcher: fetch,
      },
    }),
    new FastifyAdapter({
      logger: true,
      requestTimeout: 65_000,
    }),
  );
  app.useStaticAssets({
    root: env.webDistPath,
    prefix: "/",
    decorateReply: true,
    wildcard: false,
  });
  app.enableShutdownHooks();
  process.once("SIGTERM", () => void client.end());
  process.once("SIGINT", () => void client.end());
  await app.listen(env.port, env.host);
}

void bootstrap();
