import { describe, expect, it } from "vitest";
import { resolveHostname } from "./config";

describe("server host binding", () => {
  it("binds publicly by default and honors an explicit host", () => {
    expect(resolveHostname(undefined)).toBe("0.0.0.0");
    expect(resolveHostname("127.0.0.1")).toBe("127.0.0.1");
  });
});
