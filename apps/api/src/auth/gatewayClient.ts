import { AuthUpstreamUnavailableError } from "./authErrors";

const REQUEST_TIMEOUT_MS = 10_000;

export type GatewayFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface GatewayClientConfig {
  readonly gatewayUrl: string;
  /** Mota's public origin; also what the gateway allow-lists. */
  readonly publicUrl: string;
  readonly fetcher: GatewayFetch;
}

/** The subset of an upstream response the login proxy relays to the browser. */
export interface GatewayRelay {
  readonly status: number;
  readonly location: string | null;
  readonly setCookies: readonly string[];
}

/**
 * Talks to the central auth-gateway, which runs the Google OAuth flow and owns
 * every session cookie. Mota only relays headers in both directions, so this
 * client never sees a token value or a Supabase key.
 */
export class GatewayAuthClient {
  private readonly config: GatewayClientConfig;

  constructor(config: GatewayClientConfig) {
    this.config = config;
  }

  /** Gateway login for a same-site return path, coming back through our origin. */
  async startLogin(returnPath: string): Promise<GatewayRelay> {
    const url = new URL("/auth/google", this.config.gatewayUrl);
    url.searchParams.set("return_to", `${this.config.publicUrl}${returnPath}`);
    url.searchParams.set("callback_to", `${this.config.publicUrl}/auth/callback`);
    return this.relay(url, { method: "GET" });
  }

  async completeLogin(
    search: string,
    cookieHeader: string | undefined,
  ): Promise<GatewayRelay> {
    const url = new URL("/auth/callback", this.config.gatewayUrl);
    url.search = search;
    return this.relay(url, { method: "GET", ...this.cookieOnly(cookieHeader) });
  }

  async logout(
    cookieHeader: string | undefined,
    browserHeaders: Readonly<Record<string, string>>,
  ): Promise<GatewayRelay> {
    return this.relay(new URL("/auth/logout", this.config.gatewayUrl), {
      method: "POST",
      headers: this.mutationHeaders(cookieHeader, browserHeaders),
    });
  }

  async refresh(cookieHeader: string | undefined): Promise<GatewayRelay> {
    return this.relay(new URL("/auth/refresh", this.config.gatewayUrl), {
      method: "POST",
      headers: this.mutationHeaders(cookieHeader, {}),
    });
  }

  /**
   * The gateway rejects cookie mutations without an allow-listed Origin. This
   * server is the origin making the call, so it states so explicitly; a
   * browser's own Sec-Fetch-Site is preferred when the request carried one.
   */
  private mutationHeaders(
    cookieHeader: string | undefined,
    browserHeaders: Readonly<Record<string, string>>,
  ): Record<string, string> {
    return {
      ...(cookieHeader === undefined ? {} : { cookie: cookieHeader }),
      origin: this.config.publicUrl,
      "sec-fetch-site": browserHeaders["sec-fetch-site"] ?? "same-origin",
    };
  }

  private cookieOnly(cookieHeader: string | undefined): {
    headers?: Record<string, string>;
  } {
    return cookieHeader === undefined ? {} : { headers: { cookie: cookieHeader } };
  }

  private async relay(url: URL, init: RequestInit): Promise<GatewayRelay> {
    let response: Response;
    try {
      response = await this.config.fetcher(url, {
        ...init,
        redirect: "manual",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new AuthUpstreamUnavailableError("auth-gateway");
    }
    return {
      status: response.status,
      location: response.headers.get("location"),
      setCookies: response.headers.getSetCookie(),
    };
  }
}
