import { createHash } from "node:crypto";
import { z } from "zod";
import {
	SUBWAY_ARRIVAL_UPSTREAM_BASE,
	officialSubwayArrivalTemplate,
} from "../upstream/subwayArrivals";
import { officialSubwayPositionTemplate } from "../upstream/subwayPositions";

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
	AUTH_GATEWAY_URL: z.string().url().default("https://auth.m16khb.xyz"),
	PUBLIC_URL: z.string().url().default("http://localhost:5173"),
	SUBWAY_ARRIVAL_UPSTREAM: z
		.string()
		.url()
		.default(SUBWAY_ARRIVAL_UPSTREAM_BASE),
	SEOUL_SUBWAY_API_KEY: optionalSecretSchema,
	SEOUL_SUBWAY_QUOTA_COOLDOWN_UNTIL: z
		.string()
		.datetime({ offset: true })
		.optional(),
	SEOUL_BUS_API_KEY: optionalSecretSchema,
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
	readonly subwayPositionTemplate: string | undefined;
	readonly subwayApiKeyScope: string | undefined;
	readonly subwayQuotaCooldownUntil: number | undefined;
	readonly busApiKey: string | undefined;
	readonly databaseUrl: string;
	readonly webDistPath: string;
	readonly migrationsPath: string;
	readonly transitCatalogRefreshMs: number;
	readonly oauth: {
		readonly supabaseUrl: string;
		readonly gatewayUrl: string;
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
	if (
		parsed.SEOUL_SUBWAY_API_KEY === undefined &&
		isDirectOfficialSubwayArrivalTemplate(parsed.SUBWAY_ARRIVAL_UPSTREAM)
	) {
		throw new Error(
			"SUBWAY_ARRIVAL_UPSTREAM cannot be a direct Seoul Open API template without SEOUL_SUBWAY_API_KEY.",
		);
	}
	const subwayArrivalUpstream = parsed.SEOUL_SUBWAY_API_KEY
		? officialSubwayArrivalTemplate(parsed.SEOUL_SUBWAY_API_KEY)
		: parsed.SUBWAY_ARRIVAL_UPSTREAM;
	const subwayPositionTemplate = parsed.SEOUL_SUBWAY_API_KEY
		? officialSubwayPositionTemplate(parsed.SEOUL_SUBWAY_API_KEY)
		: undefined;
	const subwayApiKeyScope = parsed.SEOUL_SUBWAY_API_KEY
		? hashSubwayApiKey(parsed.SEOUL_SUBWAY_API_KEY)
		: undefined;
	const subwayQuotaCooldownUntil = parsed.SEOUL_SUBWAY_QUOTA_COOLDOWN_UNTIL
		? Date.parse(parsed.SEOUL_SUBWAY_QUOTA_COOLDOWN_UNTIL)
		: undefined;
	return {
		host: parsed.HOST,
		port: parsed.PORT,
		subwayArrivalUpstream,
		subwayPositionTemplate,
		subwayApiKeyScope,
		subwayQuotaCooldownUntil,
		busApiKey: parsed.SEOUL_BUS_API_KEY,
		databaseUrl,
		webDistPath: parsed.WEB_DIST_PATH,
		migrationsPath: parsed.MIGRATIONS_PATH,
		transitCatalogRefreshMs: parsed.TRANSIT_CATALOG_REFRESH_MS,
		oauth: {
			supabaseUrl: parsed.SUPABASE_URL.replace(/\/$/, ""),
			gatewayUrl: parsed.AUTH_GATEWAY_URL.replace(/\/$/, ""),
			publicUrl: parsed.PUBLIC_URL.replace(/\/$/, ""),
		},
	};
}

export function hashSubwayApiKey(apiKey: string): string {
	return createHash("sha256")
		.update(`mota:seoul-subway:${apiKey}`, "utf8")
		.digest("hex");
}

function isDirectOfficialSubwayArrivalTemplate(value: string) {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return false;
	}
	const pathname = decodeURIComponent(url.pathname);
	return (
		url.hostname.toLowerCase() === "swopenapi.seoul.go.kr" &&
		/^\/api\/subway\/[^/]+\/json\/realtimeStationArrival\/0\/100\/\{station\}\/?$/i.test(
			pathname,
		)
	);
}
