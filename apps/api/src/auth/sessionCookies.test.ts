import { describe, expect, it } from "vitest";
import {
  clearFlowCookieStrings,
  flowCookieNames,
  readCookieValue,
  secureCookies,
  serializeFlowCookies,
  serializeSessionCookies,
  sessionCookieNames,
} from "./sessionCookies";

describe("session cookies", () => {
  it("prefixes cookie names with __Host- only for https origins", () => {
    expect(secureCookies("https://mota.m16khb.xyz")).toBe(true);
    expect(secureCookies("http://localhost:5173")).toBe(false);
    expect(sessionCookieNames(true)).toEqual({
      access: "__Host-mota-access",
      refresh: "__Host-mota-refresh",
    });
    expect(flowCookieNames(false)).toEqual({
      verifier: "mota-oauth-verifier",
      state: "mota-oauth-state",
      returnUrl: "mota-return-url",
    });
  });

  it("serializes host-only httpOnly lax cookies without a Domain attribute", () => {
    const [access, refresh] = serializeSessionCookies(true, {
      access_token: "token",
      refresh_token: "refresh",
      expires_in: 3600,
    });
    expect(access).toBe(
      "__Host-mota-access=token; Max-Age=3600; Path=/; HttpOnly; Secure; SameSite=Lax",
    );
    expect(refresh).toContain("Max-Age=2592000");

    const flows = serializeFlowCookies(false, {
      verifier: "v",
      state: "s",
      returnUrl: "/%3Fstop%3D1",
    });
    expect(flows[0]).toBe(
      "mota-oauth-verifier=v; Max-Age=600; Path=/; HttpOnly; SameSite=Lax",
    );
    expect(flows[2]).toContain("mota-return-url=");

    for (const cleared of clearFlowCookieStrings(true)) {
      expect(cleared).toContain("Max-Age=0");
      expect(cleared).not.toContain("Domain=");
    }
  });

  it("reads cookie values back from a header", () => {
    const header =
      "__Host-mota-access=first; other=x; __Host-mota-refresh=second";
    expect(readCookieValue(header, "__Host-mota-access")).toBe("first");
    expect(readCookieValue(header, "__Host-mota-refresh")).toBe("second");
    expect(readCookieValue(header, "missing")).toBeNull();
    expect(readCookieValue(undefined, "__Host-mota-access")).toBeNull();
  });
});
