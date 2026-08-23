import { describe, expect, it } from "vitest";
import { loadEnv } from "./env";

describe("API environment", () => {
  it("uses Nest/Fastify and shared-service defaults", () => {
    expect(
      loadEnv({
        DATABASE_URL: "postgres://mota:secret@localhost:5432/mota",
      }),
    ).toEqual({
      host: "0.0.0.0",
      port: 3000,
      authGatewayUrl: "http://auth-gateway:3000",
      subwayArrivalUpstream: "https://k-skill.m16khb.xyz/api/subway",
      databaseUrl: "postgres://mota:secret@localhost:5432/mota",
      webDistPath: "/app/web",
      migrationsPath: "/app/drizzle",
    });
  });

  it("builds an encoded Mota database URL from home-server fields", () => {
    expect(
      loadEnv({
        HOST: "127.0.0.1",
        PORT: "4100",
        DATABASE_HOST: "home-server-pg",
        DATABASE_NAME: "mota",
        DATABASE_USER: "mota",
        DATABASE_PASSWORD: "s/ecret",
      }),
    ).toMatchObject({
      host: "127.0.0.1",
      port: 4100,
      databaseUrl: "postgres://mota:s%2Fecret@home-server-pg:5432/mota",
    });
  });

  it("rejects startup without database credentials", () => {
    expect(() => loadEnv({})).toThrow(
      "DATABASE_URL or DATABASE_PASSWORD is required.",
    );
  });
});
