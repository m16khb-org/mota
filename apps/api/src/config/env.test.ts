import { describe, expect, it } from "vitest";
import { SUBWAY_ARRIVAL_UPSTREAM_BASE } from "../upstream/subwayArrivals";
import { loadEnv } from "./env";

const SUPABASE_INPUT = {
	SUPABASE_URL: "https://mionqcczituwkryrjsfh.supabase.co/",
};

describe("API environment", () => {
	it("uses Nest/Fastify and shared-service defaults", () => {
		expect(
			loadEnv({
				...SUPABASE_INPUT,
				DATABASE_URL: "postgres://mota:secret@localhost:5432/mota",
				SEOUL_SUBWAY_API_KEY: "",
			}),
		).toEqual({
			host: "0.0.0.0",
			port: 3000,
			subwayArrivalUpstream: SUBWAY_ARRIVAL_UPSTREAM_BASE,
			databaseUrl: "postgres://mota:secret@localhost:5432/mota",
			webDistPath: "/app/web",
			migrationsPath: "/app/drizzle",
			transitCatalogRefreshMs: 86_400_000,
			oauth: {
				supabaseUrl: "https://mionqcczituwkryrjsfh.supabase.co",
				gatewayUrl: "https://auth.m16khb.xyz",
				publicUrl: "http://localhost:5173",
			},
		});
	});

	it("loads the official Seoul subway API key when configured", () => {
		expect(
			loadEnv({
				...SUPABASE_INPUT,
				DATABASE_URL: "postgres://mota:secret@localhost:5432/mota",
				SEOUL_SUBWAY_API_KEY: "official-test-key",
			}),
		).toMatchObject({
			subwayArrivalUpstream:
				"http://swopenAPI.seoul.go.kr/api/subway/official-test-key/json/realtimeStationArrival/0/100/{station}",
		});
	});

	it("builds an encoded Mota database URL from home-server fields", () => {
		expect(
			loadEnv({
				...SUPABASE_INPUT,
				HOST: "127.0.0.1",
				PORT: "4100",
				DATABASE_HOST: "home-server-pg",
				DATABASE_NAME: "mota",
				DATABASE_USER: "mota",
				DATABASE_PASSWORD: "s/ecret",
				PUBLIC_URL: "https://mota.m16khb.xyz/",
			}),
		).toMatchObject({
			host: "127.0.0.1",
			port: 4100,
			databaseUrl: "postgres://mota:s%2Fecret@home-server-pg:5432/mota",
			oauth: {
				publicUrl: "https://mota.m16khb.xyz",
			},
		});
	});

	it("rejects startup without database credentials", () => {
		expect(() => loadEnv(SUPABASE_INPUT)).toThrow(
			"DATABASE_URL or DATABASE_PASSWORD is required.",
		);
	});

	it("rejects startup without Supabase auth credentials", () => {
		expect(() =>
			loadEnv({
				DATABASE_URL: "postgres://mota:secret@localhost:5432/mota",
			}),
		).toThrow();
	});
});
