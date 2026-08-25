import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./create-test-app";
import { startFakeSupabase, type FakeSupabase } from "./fake-supabase";

describe("auth routes", () => {
  let supabase: FakeSupabase;

  beforeAll(async () => {
    supabase = await startFakeSupabase();
  });

  afterAll(async () => {
    await supabase.close();
  });

  function createAuthApp() {
    return createApp(fetch, {
      oauthConfig: {
        supabaseUrl: supabase.url,
        anonKey: "sb_publishable_test_key",
        publicUrl: "http://localhost:5173",
        fetcher: fetch,
      },
    });
  }

  it("answers anonymous session probes without cookies", async () => {
    const app = createAuthApp();

    const response = await app.request("/api/auth/session");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ authenticated: false });
  });

  it("verifies the mota session cookie locally against the JWKS", async () => {
    const app = createAuthApp();
    const token = await supabase.signAccessToken({
      sub: "user-1",
      email: "user@example.com",
    });

    const response = await app.request("/api/auth/session", {
      headers: { Cookie: `mota-access=${token}` },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      authenticated: true,
      user: { sub: "user-1", email: "user@example.com" },
    });
  });

  it("reports upstream outages instead of treating users as anonymous", async () => {
    const app = createApp(fetch, {
      oauthConfig: {
        supabaseUrl: "http://127.0.0.1:1",
        anonKey: "sb_publishable_test_key",
        publicUrl: "http://localhost:5173",
        fetcher: async () => {
          throw new Error("network down");
        },
      },
    });

    const response = await app.request("/api/auth/session", {
      headers: { Cookie: "mota-refresh=refresh-token" },
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "AUTH_UPSTREAM_UNAVAILABLE",
    });
  });

  it("rejects expired access tokens as anonymous", async () => {
    const app = createAuthApp();
    const token = await supabase.signAccessToken({
      sub: "user-1",
      expiresIn: -60,
    });

    const response = await app.request("/api/auth/session", {
      headers: { Cookie: `mota-access=${token}` },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ authenticated: false });
  });

  it("starts a PKCE login with host-only flow cookies", async () => {
    const app = createAuthApp();

    const response = await app.request(
      "/api/auth/google?return_to=%2F%3Fstop%3D123",
    );

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe(
      `${supabase.url}/auth/v1/authorize`,
    );
    expect(location.searchParams.get("provider")).toBe("google");
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("code_challenge")).toMatch(/^[\w-]+$/);
    const redirectTo = new URL(
      location.searchParams.get("redirect_to") ?? "",
    );
    expect(redirectTo.origin + redirectTo.pathname).toBe(
      "http://localhost:5173/api/auth/callback",
    );
    const stateParam = redirectTo.searchParams.get("state");
    if (stateParam === null) {
      throw new Error("missing state parameter");
    }
    expect(stateParam.length).toBeGreaterThan(20);

    const setCookies = response.headers.getSetCookie();
    expect(setCookies.length).toBe(3);
    for (const cookie of setCookies) {
      expect(cookie).toMatch(/^(mota-oauth-verifier|mota-oauth-state|mota-return-url)=/);
      expect(cookie).toContain("Max-Age=600");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");
      expect(cookie).not.toContain("Domain=");
    }
    const returnUrlCookie = setCookies.find((cookie) =>
      cookie.startsWith("mota-return-url="),
    );
    if (returnUrlCookie === undefined) {
      throw new Error("missing return url cookie");
    }
    expect(returnUrlCookie).toContain("mota-return-url=%2F%3Fstop%3D123");
  });

  it("rejects cross-site return targets", async () => {
    const app = createAuthApp();

    const response = await app.request(
      "/api/auth/google?return_to=https%3A%2F%2Fevil.example%2F",
    );

    expect(response.status).toBe(400);
  });

  it("completes the OAuth callback and sets mota session cookies", async () => {
    const app = createAuthApp();
    const start = await app.request("/api/auth/google?return_to=%2Fmap");
    const setCookies = start.headers.getSetCookie();
    const cookieHeader = setCookies
      .map((cookie) => cookie.split(";", 1)[0])
      .join("; ");
    const state = /mota-oauth-state=([^;]+)/.exec(
      setCookies.find((cookie) => cookie.startsWith("mota-oauth-state=")) ?? "",
    )?.[1];

    const response = await app.request(
      `/api/auth/callback?code=auth-code&state=${state}`,
      { headers: { Cookie: cookieHeader } },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/map");
    const cookies = response.headers.getSetCookie();
    expect(cookies.length).toBe(5);
    const accessCookie = cookies.find((cookie) =>
      cookie.startsWith("mota-access="),
    );
    const refreshCookie = cookies.find((cookie) =>
      cookie.startsWith("mota-refresh="),
    );
    if (accessCookie === undefined || refreshCookie === undefined) {
      throw new Error("missing session cookies");
    }
    expect(accessCookie).toContain("HttpOnly");
    expect(accessCookie).toContain("SameSite=Lax");
    expect(refreshCookie).toContain("Max-Age=2592000");
    expect(
      cookies.filter((cookie) =>
        /^(mota-oauth-verifier|mota-oauth-state|mota-return-url)=$/.test(
          cookie.split(";", 1)[0] ?? "",
        ),
      ).length,
    ).toBe(3);

    const accessToken =
      accessCookie.split(";", 1)[0]?.split("=").slice(1).join("=");
    const session = await app.request("/api/auth/session", {
      headers: { Cookie: `mota-access=${accessToken ?? ""}` },
    });
    await expect(session.json()).resolves.toMatchObject({
      authenticated: true,
    });
  });

  it("rejects callbacks with a mismatching state cookie", async () => {
    const app = createAuthApp();
    const start = await app.request("/api/auth/google");
    const setCookies = start.headers.getSetCookie();
    const cookieHeader = setCookies
      .map((cookie) => cookie.split(";", 1)[0])
      .join("; ");

    const response = await app.request(
      "/api/auth/callback?code=auth-code&state=forged-state",
      { headers: { Cookie: cookieHeader } },
    );

    expect(response.status).toBe(401);
  });

  it("rotates an expired access token from the refresh cookie", async () => {
    const app = createAuthApp();

    const start = await app.request("/api/auth/google");
    const cookieHeader = start.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";", 1)[0])
      .join("; ");
    const state = /mota-oauth-state=([^;]+)/.exec(
      start.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith("mota-oauth-state=")) ?? "",
    )?.[1];
    if (state === undefined) {
      throw new Error("missing state cookie");
    }
    const callback = await app.request(
      `/api/auth/callback?code=auth-code&state=${state}`,
      { headers: { Cookie: cookieHeader } },
    );
    const callbackCookies = callback.headers.getSetCookie();
    const refreshToken = /mota-refresh=([^;]+)/.exec(
      callbackCookies.find((cookie) => cookie.startsWith("mota-refresh=")) ??
        "",
    )?.[1];
    if (refreshToken === undefined) {
      throw new Error("missing refresh cookie");
    }

    const response = await app.request("/api/auth/session", {
      headers: { Cookie: `mota-refresh=${refreshToken}` },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      authenticated: true,
    });
    const rotated = response.headers.getSetCookie();
    expect(
      rotated.find((cookie) => cookie.startsWith("mota-access=")),
    ).toBeDefined();
    expect(
      rotated.find((cookie) => cookie.startsWith("mota-refresh=")),
    ).toBeDefined();
  });
});
