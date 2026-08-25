// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAuthSession } from "./useAuthSession";

describe("useAuthSession", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the verified user identity", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          authenticated: true,
          user: { sub: "user-1", email: "mota@example.com" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAuthSession());

    await waitFor(() => expect(result.current.checked).toBe(true));
    expect(result.current).toMatchObject({
      authenticated: true,
      user: { sub: "user-1", email: "mota@example.com" },
      error: null,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/session",
      expect.objectContaining({
        credentials: "include",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("resets to an anonymous session after logout", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ authenticated: true, user: { sub: "user-1", email: "mota@example.com" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAuthSession());
    await waitFor(() => expect(result.current.authenticated).toBe(true));

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current).toMatchObject({
      authenticated: false,
      checked: true,
      user: null,
      error: null,
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/auth/logout",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });

  it("distinguishes an anonymous session from a failed session check", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ authenticated: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockRejectedValueOnce(new TypeError("network unavailable"));
    vi.stubGlobal("fetch", fetchMock);

    const anonymous = renderHook(() => useAuthSession());
    await waitFor(() => expect(anonymous.result.current.checked).toBe(true));
    expect(anonymous.result.current).toMatchObject({
      authenticated: false,
      user: null,
      error: null,
    });
    anonymous.unmount();

    const failed = renderHook(() => useAuthSession());
    await waitFor(() => expect(failed.result.current.checked).toBe(true));
    expect(failed.result.current).toMatchObject({
      authenticated: false,
      user: null,
      error: "로그인 상태를 확인하지 못했습니다.",
    });
  });
});
