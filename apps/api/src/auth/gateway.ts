import { z } from "zod";

const gatewayUserSchema = z.object({
  sub: z.string().min(1),
  role: z.literal("authenticated"),
  email: z.string().email().optional(),
  sessionId: z.string().optional(),
});

export interface GatewayUser {
  readonly sub: string;
  readonly email?: string | undefined;
}

export type SessionCookieWriter = (
  cookies: readonly string[],
) => void;

export type SessionVerifier = (
  cookieHeader: string | undefined,
  onSetCookie?: SessionCookieWriter,
) => Promise<GatewayUser | null>;

interface GatewayVerifierOptions {
  readonly baseUrl?: string;
  readonly fetcher?: typeof fetch;
  readonly onSetCookie?: ((cookies: readonly string[]) => void) | undefined;
}

export class GatewayUnavailableError extends Error {
  constructor() {
    super("Auth gateway is unavailable.");
    this.name = "GatewayUnavailableError";
  }
}

function cookieValue(
  cookieHeader: string | undefined,
  cookieName: string,
): string | null {
  if (!cookieHeader) {
    return null;
  }
  for (const pair of cookieHeader.split(";")) {
    const [name, ...valueParts] = pair.trim().split("=");
    if (name === cookieName) {
      const value = valueParts.join("=");
      return value ? decodeURIComponent(value) : null;
    }
  }
  return null;
}

async function fetchGateway(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetcher(url, init);
  } catch {
    throw new GatewayUnavailableError();
  }
}

async function verifyAccessToken(
  fetcher: typeof fetch,
  baseUrl: string,
  token: string,
): Promise<GatewayUser | null> {
  const response = await fetchGateway(fetcher, `${baseUrl}/me`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8_000),
  });
  if (response.status === 401 || response.status === 403) {
    return null;
  }
  if (!response.ok) {
    throw new GatewayUnavailableError();
  }
  const parsed = gatewayUserSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new GatewayUnavailableError();
  }
  return {
    sub: parsed.data.sub,
    email: parsed.data.email,
  };
}

function accessTokenFromSetCookies(
  setCookies: readonly string[],
): string | null {
  const accessCookie = setCookies.find((cookie) =>
    cookie.startsWith("agw-access="),
  );
  if (!accessCookie) {
    return null;
  }
  return cookieValue(accessCookie.split(";", 1)[0], "agw-access");
}

export async function verifyGatewaySession(
  cookieHeader: string | undefined,
  options: GatewayVerifierOptions = {},
): Promise<GatewayUser | null> {
  const accessToken = cookieValue(cookieHeader, "agw-access");
  const refreshToken = cookieValue(cookieHeader, "agw-refresh");
  if (!accessToken && !refreshToken) {
    return null;
  }
  const baseUrl =
    (
      options.baseUrl ??
      process.env.AUTH_GATEWAY_URL ??
      "http://auth-gateway:3000"
    ).replace(/\/$/, "");
  const fetcher = options.fetcher ?? fetch;

  if (accessToken) {
    const user = await verifyAccessToken(fetcher, baseUrl, accessToken);
    if (user) {
      return user;
    }
  }

  if (!refreshToken) {
    return null;
  }

  const refreshResponse = await fetchGateway(
    fetcher,
    `${baseUrl}/auth/refresh`,
    {
      method: "POST",
      headers: {
        Cookie: `agw-refresh=${encodeURIComponent(refreshToken)}`,
      },
      signal: AbortSignal.timeout(8_000),
    },
  );
  if (
    refreshResponse.status === 401 ||
    refreshResponse.status === 403
  ) {
    return null;
  }
  if (!refreshResponse.ok) {
    throw new GatewayUnavailableError();
  }
  const setCookies = refreshResponse.headers.getSetCookie();
  const refreshedAccessToken = accessTokenFromSetCookies(setCookies);
  if (!refreshedAccessToken) {
    throw new GatewayUnavailableError();
  }
  const refreshedUser = await verifyAccessToken(
    fetcher,
    baseUrl,
    refreshedAccessToken,
  );
  if (!refreshedUser) {
    throw new GatewayUnavailableError();
  }
  options.onSetCookie?.(setCookies);
  return refreshedUser;
}
