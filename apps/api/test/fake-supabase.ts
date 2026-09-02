import { createServer, type Server } from "node:http";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

export interface FakeSupabase {
  readonly url: string;
  readonly issuer: string;
  readonly jwksUrl: string;
  close(): Promise<void>;
  signAccessToken(claims: {
    readonly sub: string;
    readonly email?: string | undefined;
    readonly expiresIn?: number | undefined;
  }): Promise<string>;
}

/**
 * Minimal fake of the only Supabase endpoint mota still depends on: the
 * public JWKS document its access tokens are verified against. The token
 * grants and signout belong to the auth-gateway now.
 */
export async function startFakeSupabase(): Promise<FakeSupabase> {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const publicJwk = await exportJWK(publicKey);

  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (
      request.method === "GET" &&
      url.pathname === "/auth/v1/.well-known/jwks.json"
    ) {
      respond(response, 200, {
        keys: [{ ...publicJwk, kid: "test-key", alg: "ES256", use: "sig" }],
      });
      return;
    }
    respond(response, 404, { error: "not found" });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("fake supabase failed to listen");
  }
  const url = `http://127.0.0.1:${address.port}`;

  const signToken = async ({
    sub,
    email,
    expiresIn = 3600,
  }: {
    readonly sub: string;
    readonly email?: string | undefined;
    readonly expiresIn?: number | undefined;
  }): Promise<string> =>
    new SignJWT({
      role: "authenticated",
      ...(email === undefined ? {} : { email }),
    })
      .setProtectedHeader({ alg: "ES256", kid: "test-key" })
      .setSubject(sub)
      .setIssuer(`${url}/auth/v1`)
      .setAudience("authenticated")
      .setIssuedAt()
      .setExpirationTime(`${expiresIn}s`)
      .sign(privateKey);

  return {
    url,
    issuer: `${url}/auth/v1`,
    jwksUrl: `${url}/auth/v1/.well-known/jwks.json`,
    async signAccessToken(claims) {
      return signToken(claims);
    },
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      });
    },
  };
}

function respond(
  response: import("node:http").ServerResponse,
  status: number,
  body: unknown,
): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}
