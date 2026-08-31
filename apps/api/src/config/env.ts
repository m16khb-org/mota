import { z } from "zod";
import {
	SUBWAY_ARRIVAL_UPSTREAM_BASE,
	officialSubwayArrivalTemplate,
} from "../upstream/subwayArrivals";

const DAY_MS = 24 * 60 * 60 * 1_000;
const optionalSecretSchema = z.preprocess(
	(value) =>
		typeof value === "string" && value.trim() === ""
			? undefined
			: value,
	z.string().trim().min(1).optional(),
);

const envSchema = z.object({
	HOST: z.string().min(1).default("0.0.0.0"),
	PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
	SUPABASE_URL: z.string().url(),
	SUPABASE_ANON_KEY: z.string().min(1),
	PUBLIC_URL: z.string().url().default("http://localhost:5173"),
	SUBWAY_ARRIVAL_UPSTREAM: z
		.string()
		.url()
		.default(SUBWAY_ARRIVAL_UPSTREAM_BASE),
	SEOUL_SUBWAY_API_KEY: optionalSecretSchema,
	DATABASE_URL: z.string().url().optional(),
	DATABASE_HOST: z.string().min(1).default("home-server-pg"),
	DATABASE_PORT: z.coerce.number().int().min(1).max(65_535).default(5432),
	DATABASE_NAME: z.string().min(1).default("mota"),
	DATABASE_USER: z.string().min(1).default("mota"),
	DATABASE_PASSWORD: z.string().min(1).optional(),
	WEB_DIST_PATH: z.string().min(1).default("/app/web"),
	MIGRATIONS_PATH: z.string().min(1).default("/app/drizzle"),
	TRANSIT_CATALOG_REFRESH_MS: z.coerce
		.number()
		.int()
		.min(60_000)
		.max(7 * DAY_MS)
		.default(DAY_MS),
});

export interface ApiEnv {
	readonly host: string;
	readonly port: number;
	readonly subwayArrivalUpstream: string;
	readonly databaseUrl: string;
	readonly webDistPath: string;
	readonly migrationsPath: string;
	readonly transitCatalogRefreshMs: number;
	readonly oauth: {
		readonly supabaseUrl: string;
		readonly anonKey: string;
		readonly publicUrl: string;
	};
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
	const subwayArrivalUpstream = parsed.SEOUL_SUBWAY_API_KEY
		? officialSubwayArrivalTemplate(parsed.SEOUL_SUBWAY_API_KEY)
		: parsed.SUBWAY_ARRIVAL_UPSTREAM;
	return {
		host: parsed.HOST,
		port: parsed.PORT,
		subwayArrivalUpstream,
		databaseUrl,
		webDistPath: parsed.WEB_DIST_PATH,
		migrationsPath: parsed.MIGRATIONS_PATH,
		transitCatalogRefreshMs: parsed.TRANSIT_CATALOG_REFRESH_MS,
		oauth: {
			supabaseUrl: parsed.SUPABASE_URL.replace(/\/$/, ""),
			anonKey: parsed.SUPABASE_ANON_KEY,
			publicUrl: parsed.PUBLIC_URL.replace(/\/$/, ""),
		},
	};
}
