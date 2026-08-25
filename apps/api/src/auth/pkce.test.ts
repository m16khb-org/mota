import { describe, expect, it } from "vitest";
import { computeCodeChallenge, generateOAuthState, generateCodeVerifier } from "./pkce";

describe("PKCE helpers", () => {
  it("generates base64url verifier and state values", () => {
    const verifier = generateCodeVerifier();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateOAuthState()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateCodeVerifier()).not.toBe(verifier);
  });

  it("derives the S256 code challenge from RFC 7636 appendix B", async () => {
    await expect(
      computeCodeChallenge(
        "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
      ),
    ).resolves.toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});
