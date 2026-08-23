import { z } from "zod";

const envSchema = z.object({
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  AUTH_GATEWAY_URL: z.string().url().default("http://auth-gateway:3000"),
  SUBWAY_ARRIVAL_UPSTREAM: z
    .string()
    .url()
    .default("https://k-skill.m16khb.xyz/api/subway"),
  DATABASE_URL: z.string().url().optional(),
  DATABASE_HOST: z.string().min(1).default("home-server-pg"),
  DATABASE_PORT: z.coerce.number().int().min(1).max(65_535).default(5432),
  DATABASE_NAME: z.string().min(1).default("mota"),
  DATABASE_USER: z.string().min(1).default("mota"),
  DATABASE_PASSWORD: z.string().min(1).optional(),
  WEB_DIST_PATH: z.string().min(1).default("/app/web"),
  MIGRATIONS_PATH: z.string().min(1).default("/app/drizzle"),
});

export interface ApiEnv {
  readonly host: string;
  readonly port: number;
  readonly authGatewayUrl: string;
  readonly subwayArrivalUpstream: string;
  readonly databaseUrl: string;
  readonly webDistPath: string;
  readonly migrationsPath: string;
}

export function loadEnv(
  source: Record<string, string | undefined> = process.env,
): ApiEnv {
  const parsed = envSchema.parse(source);
  const databaseUrl =
    parsed.DATABASE_URL ??
    (parsed.DATABASE_PASSWORD
      ? `postgres://${encodeURIComponent(parsed.DATABASE_USER)}:${encodeURIComponent(
          parsed.DATABASE_PASSWORD,
        )}@${parsed.DATABASE_HOST}:${parsed.DATABASE_PORT}/${encodeURIComponent(
          parsed.DATABASE_NAME,
        )}`
      : null);
  if (!databaseUrl) {
    throw new Error("DATABASE_URL or DATABASE_PASSWORD is required.");
  }
  return {
    host: parsed.HOST,
    port: parsed.PORT,
    authGatewayUrl: parsed.AUTH_GATEWAY_URL,
    subwayArrivalUpstream: parsed.SUBWAY_ARRIVAL_UPSTREAM,
    databaseUrl,
    webDistPath: parsed.WEB_DIST_PATH,
    migrationsPath: parsed.MIGRATIONS_PATH,
  };
}
