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

  it("does not hide auth-gateway outages as anonymous sessions", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("unavailable", { status: 503 }));

    await expect(
      verifyGatewaySession("agw-access=token", { fetcher }),
    ).rejects.toBeInstanceOf(GatewayUnavailableError);
  });
});
