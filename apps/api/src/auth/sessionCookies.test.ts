import { describe, expect, it } from "vitest";
import { readCookieValue, secureCookies, sessionCookieNames } from "./sessionCookies";

describe("session cookies", () => {
  it("prefixes the gateway cookie names with __Host- only for https origins", () => {
    expect(secureCookies("https://mota.m16khb.xyz")).toBe(true);
    expect(secureCookies("http://localhost:5173")).toBe(false);
    expect(sessionCookieNames(true)).toEqual({
      access: "__Host-agw-access",
      refresh: "__Host-agw-refresh",
    });
    expect(sessionCookieNames(false)).toEqual({
      access: "agw-access",
      refresh: "agw-refresh",
    });
  });

  it("reads cookie values back from a header", () => {
    const header = "__Host-agw-access=first; other=x; __Host-agw-refresh=second";
    expect(readCookieValue(header, "__Host-agw-access")).toBe("first");
    expect(readCookieValue(header, "__Host-agw-refresh")).toBe("second");
    expect(readCookieValue(header, "missing")).toBeNull();
    expect(readCookieValue(undefined, "__Host-agw-access")).toBeNull();
  });
});
