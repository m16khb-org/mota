import { createServer, type Server } from "node:http";

export interface GatewayCall {
  readonly method: string;
  readonly path: string;
  readonly search: string;
  readonly cookie: string | undefined;
  readonly origin: string | undefined;
  readonly fetchSite: string | undefined;
}

export interface FakeGateway {
  readonly url: string;
  readonly calls: GatewayCall[];
  /** Access token the /auth/refresh route hands back in a rotated cookie. */
  rotatedAccessToken: string;
  /** Status the /auth/refresh route answers with. */
  refreshStatus: number;
  close(): Promise<void>;
}

/**
 * Minimal fake of the auth-gateway routes mota proxies. It mirrors the real
 * contract that matters here: cookie mutations require an allow-listed Origin,
 * and every route answers with Set-Cookie headers the proxy must relay.
 */
export async function startFakeGateway(
  allowedOrigin = "http://localhost:5173",
): Promise<FakeGateway> {
  const calls: GatewayCall[] = [];
  const state = { rotatedAccessToken: "rotated-token", refreshStatus: 200 };

  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const origin = header(request.headers.origin);
    calls.push({
      method: request.method ?? "GET",
      path: url.pathname,
      search: url.search,
      cookie: header(request.headers.cookie),
      origin,
      fetchSite: header(request.headers["sec-fetch-site"]),
    });
    request.resume();

    if (url.pathname === "/auth/google") {
      const returnTo = url.searchParams.get("return_to") ?? "";
      if (!returnTo.startsWith(allowedOrigin)) {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ message: "return_to origin is not allow-listed" }));
        return;
      }
      response.writeHead(302, {
        location: `https://supabase.test/auth/v1/authorize?redirect_to=${encodeURIComponent(
          url.searchParams.get("callback_to") ?? "",
        )}`,
        "set-cookie": [
          "agw-oauth-verifier=verifier; Max-Age=600; Path=/; HttpOnly; SameSite=Lax",
          "agw-oauth-state=state; Max-Age=600; Path=/; HttpOnly; SameSite=Lax",
          "agw-return-url=return; Max-Age=600; Path=/; HttpOnly; SameSite=Lax",
        ],
      });
      response.end();
      return;
    }

    if (url.pathname === "/auth/callback") {
      response.writeHead(302, {
        location: `${allowedOrigin}/map`,
        "set-cookie": [
          "agw-access=session-token; Max-Age=3600; Path=/; HttpOnly; SameSite=Lax",
          "agw-refresh=session-refresh; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax",
          "agw-oauth-verifier=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax",
        ],
      });
      response.end();
      return;
    }

    if (url.pathname === "/auth/logout" || url.pathname === "/auth/refresh") {
      if (origin !== allowedOrigin) {
        response.writeHead(403, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ message: "cross-site cookie mutation rejected" }));
        return;
      }
      if (url.pathname === "/auth/refresh") {
        response.writeHead(state.refreshStatus, {
          "Content-Type": "application/json",
          "set-cookie": [
            `agw-access=${state.rotatedAccessToken}; Max-Age=3600; Path=/; HttpOnly; SameSite=Lax`,
            "agw-refresh=rotated-refresh; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax",
          ],
        });
        response.end(JSON.stringify({ status: "ok" }));
        return;
      }
      response.writeHead(200, {
        "Content-Type": "application/json",
        "set-cookie": [
          "agw-access=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax",
          "agw-refresh=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax",
        ],
      });
      response.end(JSON.stringify({ status: "ok" }));
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "not found" }));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("fake gateway failed to listen");
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    calls,
    get rotatedAccessToken() {
      return state.rotatedAccessToken;
    },
    set rotatedAccessToken(value: string) {
      state.rotatedAccessToken = value;
    },
    get refreshStatus() {
      return state.refreshStatus;
    },
    set refreshStatus(value: number) {
      state.refreshStatus = value;
    },
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      });
    },
  };
}

function header(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}
