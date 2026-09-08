import { describe, expect, it } from "vitest";
import { SUBWAY_ARRIVAL_UPSTREAM_BASE } from "../upstream/subwayArrivals";
import { hashSubwayApiKey, loadEnv } from "./env";

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
			subwayPositionTemplate: undefined,
			subwayApiKeyScope: undefined,
			subwayQuotaCooldownUntil: undefined,
			busApiKey: undefined,
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
			subwayPositionTemplate:
				"http://swopenAPI.seoul.go.kr/api/subway/official-test-key/json/realtimePosition/0/100/{line}",
			subwayApiKeyScope: hashSubwayApiKey("official-test-key"),
		});
	});

	it("rejects a direct official arrival template without the authoritative key", () => {
		expect(() =>
			loadEnv({
				...SUPABASE_INPUT,
				DATABASE_URL: "postgres://mota:secret@localhost:5432/mota",
				SUBWAY_ARRIVAL_UPSTREAM:
					"http://swopenAPI.seoul.go.kr/api/subway/embedded-key/json/realtimeStationArrival/0/100/{station}",
			}),
		).toThrow(/SEOUL_SUBWAY_API_KEY/);
	});

	it("uses the authoritative key when a conflicting direct template is supplied", () => {
		expect(
			loadEnv({
				...SUPABASE_INPUT,
				DATABASE_URL: "postgres://mota:secret@localhost:5432/mota",
				SEOUL_SUBWAY_API_KEY: "authoritative-key",
				SUBWAY_ARRIVAL_UPSTREAM:
					"http://swopenAPI.seoul.go.kr/api/subway/other-key/json/realtimeStationArrival/0/100/{station}",
			}),
		).toMatchObject({
			subwayArrivalUpstream:
				"http://swopenAPI.seoul.go.kr/api/subway/authoritative-key/json/realtimeStationArrival/0/100/{station}",
			subwayApiKeyScope: hashSubwayApiKey("authoritative-key"),
		});
	});

	it("preserves custom proxy and test upstream origins", () => {
		expect(
			loadEnv({
				...SUPABASE_INPUT,
				DATABASE_URL: "postgres://mota:secret@localhost:5432/mota",
				SUBWAY_ARRIVAL_UPSTREAM: "https://subway-arrival.test",
			}),
		).toMatchObject({
			subwayArrivalUpstream: "https://subway-arrival.test",
			subwayApiKeyScope: undefined,
		});
	});

	it("parses an operator-supplied cooldown without retaining the key", () => {
		expect(
			loadEnv({
				...SUPABASE_INPUT,
				DATABASE_URL: "postgres://mota:secret@localhost:5432/mota",
				SEOUL_SUBWAY_API_KEY: "official-test-key",
				SEOUL_SUBWAY_QUOTA_COOLDOWN_UNTIL: "2026-09-09T12:10:00.000Z",
			}),
		).toMatchObject({
			subwayQuotaCooldownUntil: Date.parse("2026-09-09T12:10:00.000Z"),
		});
	});

	it("loads an optional Seoul bus API key without requiring it at startup", () => {
		expect(
			loadEnv({
				...SUPABASE_INPUT,
				DATABASE_URL: "postgres://mota:secret@localhost:5432/mota",
				SEOUL_BUS_API_KEY: " bus-test-key ",
			}),
		).toMatchObject({ busApiKey: "bus-test-key" });
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
