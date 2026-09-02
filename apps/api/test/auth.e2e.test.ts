import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./create-test-app";
import { startFakeGateway, type FakeGateway } from "./fake-gateway";
import { startFakeSupabase, type FakeSupabase } from "./fake-supabase";

const PUBLIC_URL = "http://localhost:5173";

describe("auth routes", () => {
  let supabase: FakeSupabase;
  let gateway: FakeGateway;

  beforeAll(async () => {
    supabase = await startFakeSupabase();
    gateway = await startFakeGateway(PUBLIC_URL);
  });

  beforeEach(() => {
    gateway.calls.length = 0;
    gateway.refreshStatus = 200;
  });

  afterAll(async () => {
    await Promise.all([supabase.close(), gateway.close()]);
  });

  function createAuthApp() {
    return createApp(fetch, {
      oauthConfig: {
        supabaseUrl: supabase.url,
        gatewayUrl: gateway.url,
        publicUrl: PUBLIC_URL,
        fetcher: fetch,
      },
    });
  }

  it("answers anonymous session probes without cookies", async () => {
    const app = createAuthApp();

    const response = await app.request("/api/auth/session");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ authenticated: false });
    expect(gateway.calls).toEqual([]);
  });

  it("verifies the gateway session cookie locally against the JWKS", async () => {
    const app = createAuthApp();
    const token = await supabase.signAccessToken({
      sub: "user-1",
      email: "user@example.com",
    });

    const response = await app.request("/api/auth/session", {
      headers: { Cookie: `agw-access=${token}` },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      authenticated: true,
      user: { sub: "user-1", email: "user@example.com" },
    });
    // A valid access token must not cost a gateway round trip.
    expect(gateway.calls).toEqual([]);
  });

  it("rejects expired access tokens as anonymous", async () => {
    const app = createAuthApp();
    const token = await supabase.signAccessToken({
      sub: "user-1",
      expiresIn: -60,
    });

    const response = await app.request("/api/auth/session", {
      headers: { Cookie: `agw-access=${token}` },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ authenticated: false });
  });

  it("reports upstream outages instead of treating users as anonymous", async () => {
    const app = createApp(fetch, {
      oauthConfig: {
        supabaseUrl: supabase.url,
        gatewayUrl: "http://127.0.0.1:1",
        publicUrl: PUBLIC_URL,
        fetcher: async () => {
          throw new Error("network down");
        },
      },
    });

    const response = await app.request("/api/auth/session", {
      headers: { Cookie: "agw-refresh=refresh-token" },
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "AUTH_UPSTREAM_UNAVAILABLE",
    });
  });

  it("starts login through the gateway and relays its flow cookies", async () => {
    const app = createAuthApp();

    const response = await app.request(
      "/api/auth/google?return_to=%2F%3Fstop%3D123",
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain(
      "https://supabase.test/auth/v1/authorize",
    );
    const [start] = gateway.calls;
    if (start === undefined) {
      throw new Error("gateway was not called");
    }
    const search = new URLSearchParams(start.search);
    expect(start.path).toBe("/auth/google");
    expect(search.get("return_to")).toBe(`${PUBLIC_URL}/?stop=123`);
    // The gateway accepts a callback target only at exactly /auth/callback.
    expect(search.get("callback_to")).toBe(`${PUBLIC_URL}/auth/callback`);

    const setCookies = response.headers.getSetCookie();
    expect(setCookies).toHaveLength(3);
    for (const cookie of setCookies) {
      expect(cookie).toMatch(/^agw-oauth-(verifier|state)=|^agw-return-url=/);
      expect(cookie).not.toContain("Domain=");
    }
  });

  it("rejects cross-site return targets before calling the gateway", async () => {
    const app = createAuthApp();

    const response = await app.request(
      "/api/auth/google?return_to=https%3A%2F%2Fevil.example%2F",
    );

    expect(response.status).toBe(400);
    expect(gateway.calls).toEqual([]);
  });

  it("completes the callback on its own origin and relays the session cookies", async () => {
    const app = createAuthApp();

    const response = await app.request(
      "/auth/callback?code=auth-code&state=oauth-state",
      { headers: { Cookie: "agw-oauth-verifier=verifier" } },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${PUBLIC_URL}/map`);
    const [callback] = gateway.calls;
    if (callback === undefined) {
      throw new Error("gateway was not called");
    }
    expect(callback.path).toBe("/auth/callback");
    expect(callback.search).toBe("?code=auth-code&state=oauth-state");
    expect(callback.cookie).toBe("agw-oauth-verifier=verifier");
    expect(response.headers.getSetCookie()).toHaveLength(3);
  });

  it("logs out through the gateway with an allow-listed Origin", async () => {
    const app = createAuthApp();

    const response = await app.request("/api/auth/logout", {
      method: "POST",
      headers: { Cookie: "agw-access=token; agw-refresh=refresh-token" },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
    const [logout] = gateway.calls;
    if (logout === undefined) {
      throw new Error("gateway was not called");
    }
    // Without this header the hardened gateway answers 403.
    expect(logout.origin).toBe(PUBLIC_URL);
    expect(logout.cookie).toBe("agw-access=token; agw-refresh=refresh-token");
    for (const cookie of response.headers.getSetCookie()) {
      expect(cookie).toContain("Max-Age=0");
      expect(cookie).not.toContain("Domain=");
    }
  });

  it("rotates an expired access token through the gateway refresh route", async () => {
    const app = createAuthApp();
    gateway.rotatedAccessToken = await supabase.signAccessToken({
      sub: "user-1",
      email: "user@example.com",
    });

    const response = await app.request("/api/auth/session", {
      headers: { Cookie: "agw-refresh=session-refresh" },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      authenticated: true,
      user: { sub: "user-1" },
    });
    const rotated = response.headers.getSetCookie();
    expect(rotated.find((cookie) => cookie.startsWith("agw-access="))).toBeDefined();
    expect(rotated.find((cookie) => cookie.startsWith("agw-refresh="))).toBeDefined();
    expect(gateway.calls[0]?.path).toBe("/auth/refresh");
  });

  it("treats a refused refresh as an anonymous session", async () => {
    const app = createAuthApp();
    gateway.refreshStatus = 401;

    const response = await app.request("/api/auth/session", {
      headers: { Cookie: "agw-refresh=revoked" },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ authenticated: false });
  });
});
