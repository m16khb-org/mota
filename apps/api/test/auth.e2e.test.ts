import { describe, expect, it } from "vitest";
import { createApp } from "./create-test-app";

describe("auth session route", () => {
  it("relays rotated gateway cookies to the browser", async () => {
    const setCookies = [
      "agw-access=fresh-access; Max-Age=3600; Domain=.m16khb.xyz; Path=/; HttpOnly; Secure; SameSite=Lax",
      "agw-refresh=fresh-refresh; Max-Age=2592000; Domain=.m16khb.xyz; Path=/; HttpOnly; Secure; SameSite=Lax",
    ];
    const app = createApp(fetch, {
      verifySession: async (_cookie, onSetCookie) => {
        onSetCookie?.(setCookies);
        return {
          sub: "auth-user-123",
          email: "user@example.com",
        };
      },
    });

    const response = await app.request("/api/auth/session", {
      headers: {
        Cookie: "agw-refresh=refresh-token",
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toEqual(setCookies);
    await expect(response.json()).resolves.toEqual({
      authenticated: true,
      user: {
        sub: "auth-user-123",
        email: "user@example.com",
      },
    });
  });
});
