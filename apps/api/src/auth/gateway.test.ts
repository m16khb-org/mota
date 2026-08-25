import { describe, expect, it, vi } from "vitest";
import {
  GatewayUnavailableError,
  verifyGatewaySession,
} from "./gateway";

describe("verifyGatewaySession", () => {
  it("delegates the gateway cookie token to auth-gateway /me", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        sub: "auth-user-123",
        role: "authenticated",
        email: "user@example.com",
        sessionId: "session-1",
      }),
    );

    await expect(
      verifyGatewaySession("other=value; agw-access=gateway-token", {
        baseUrl: "http://auth-gateway:3000",
        fetcher,
      }),
    ).resolves.toEqual({
      sub: "auth-user-123",
      email: "user@example.com",
    });
    expect(fetcher).toHaveBeenCalledWith("http://auth-gateway:3000/me", {
      headers: { Authorization: "Bearer gateway-token" },
      signal: expect.any(AbortSignal),
    });
  });

  it("returns anonymous without calling auth-gateway when the cookie is missing", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      verifyGatewaySession(undefined, { fetcher }),
    ).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("maps an expired or rejected gateway token to anonymous", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 401 }));

    await expect(
      verifyGatewaySession("agw-access=expired", { fetcher }),
    ).resolves.toBeNull();
  });

  it("refreshes the session when the expired access cookie has disappeared", async () => {
    const refreshHeaders = new Headers();
    refreshHeaders.append(
      "Set-Cookie",
      "agw-access=fresh-access; Max-Age=3600; Domain=.m16khb.xyz; Path=/; HttpOnly; Secure; SameSite=Lax",
    );
    refreshHeaders.append(
      "Set-Cookie",
      "agw-refresh=fresh-refresh; Max-Age=2592000; Domain=.m16khb.xyz; Path=/; HttpOnly; Secure; SameSite=Lax",
    );
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          { status: "ok" },
          { status: 200, headers: refreshHeaders },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({
          sub: "auth-user-123",
          role: "authenticated",
          email: "user@example.com",
        }),
      );
    const setCookies = vi.fn();

    await expect(
      verifyGatewaySession("agw-refresh=refresh-token", {
        baseUrl: "http://auth-gateway:3000",
        fetcher,
        onSetCookie: setCookies,
      }),
    ).resolves.toEqual({
      sub: "auth-user-123",
      email: "user@example.com",
    });
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "http://auth-gateway:3000/auth/refresh",
      {
        method: "POST",
        headers: { Cookie: "agw-refresh=refresh-token" },
        signal: expect.any(AbortSignal),
      },
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "http://auth-gateway:3000/me",
      {
        headers: { Authorization: "Bearer fresh-access" },
        signal: expect.any(AbortSignal),
      },
    );
    expect(setCookies).toHaveBeenCalledWith([
      expect.stringContaining("agw-access=fresh-access"),
      expect.stringContaining("agw-refresh=fresh-refresh"),
    ]);
  });

  it("refreshes after auth-gateway rejects an expired access token", async () => {
    const refreshHeaders = new Headers();
    refreshHeaders.append("Set-Cookie", "agw-access=fresh-access; Path=/");
    refreshHeaders.append("Set-Cookie", "agw-refresh=fresh-refresh; Path=/");
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        Response.json(
          { status: "ok" },
          { status: 200, headers: refreshHeaders },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({
          sub: "auth-user-123",
          role: "authenticated",
        }),
      );

    await expect(
      verifyGatewaySession(
        "agw-access=expired; agw-refresh=refresh-token",
        {
          baseUrl: "http://auth-gateway:3000",
          fetcher,
        },
      ),
    ).resolves.toEqual({ sub: "auth-user-123", email: undefined });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("does not hide auth-gateway outages as anonymous sessions", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("unavailable", { status: 503 }));

    await expect(
      verifyGatewaySession("agw-access=token", { fetcher }),
    ).rejects.toBeInstanceOf(GatewayUnavailableError);
  });
});
