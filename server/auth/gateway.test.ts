import {
  exportJWK,
  generateKeyPair,
  SignJWT,
} from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { verifyGatewaySession } from "./gateway";

const issuer = "https://mionqcczituwkryrjsfh.supabase.co/auth/v1";
const jwksUrl = `${issuer}/.well-known/jwks.json`;

type SigningKey = Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];

let signingKey: SigningKey;
let publicJwk: Record<string, unknown>;

async function mintToken(
  key: SigningKey,
  claims: { readonly role?: string; readonly issuer?: string } = {},
): Promise<string> {
  return new SignJWT({
    sub: "user-123",
    email: "user@example.com",
    role: claims.role ?? "authenticated",
  })
    .setProtectedHeader({ alg: "ES256", kid: "gateway-test" })
    .setIssuer(claims.issuer ?? issuer)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}

beforeAll(async () => {
  const keyPair = await generateKeyPair("ES256");
  signingKey = keyPair.privateKey;
  publicJwk = await exportJWK(keyPair.publicKey);

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === jwksUrl) {
        return Response.json({
          keys: [{ ...publicJwk, alg: "ES256", kid: "gateway-test" }],
        });
      }
      throw new Error(`Unexpected fetch: ${String(input)} ${init?.method ?? "GET"}`);
    }),
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("verifyGatewaySession", () => {
  it("accepts a valid gateway session and extracts the user", async () => {
    const token = await mintToken(signingKey);

    await expect(
      verifyGatewaySession(`other=value; agw-access=${token}`),
    ).resolves.toEqual({ sub: "user-123", email: "user@example.com" });
  });

  it("rejects a token signed by a foreign key", async () => {
    const foreignKeyPair = await generateKeyPair("ES256");
    const token = await mintToken(foreignKeyPair.privateKey);

    await expect(verifyGatewaySession(`agw-access=${token}`)).resolves.toBeNull();
  });

  it("rejects a token with the wrong issuer", async () => {
    const token = await mintToken(signingKey, { issuer: "https://foreign.example/auth/v1" });

    await expect(verifyGatewaySession(`agw-access=${token}`)).resolves.toBeNull();
  });

  it("rejects an anonymous role", async () => {
    const token = await mintToken(signingKey, { role: "anon" });

    await expect(verifyGatewaySession(`agw-access=${token}`)).resolves.toBeNull();
  });

  it("returns null when the access cookie is missing", async () => {
    await expect(verifyGatewaySession(undefined)).resolves.toBeNull();
  });
});
