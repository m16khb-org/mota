import type { AuthUser } from "@mota/contracts/auth";
import { AuthUpstreamUnavailableError } from "./authErrors";
import {
  GatewayAuthClient,
  type GatewayClientConfig,
} from "./gatewayClient";
import { readCookieValue, secureCookies, sessionCookieNames } from "./sessionCookies";
import { verifyAccessToken } from "./supabaseJwt";

export type SessionCookieWriter = (cookies: readonly string[]) => void;

export interface SessionVerifierOptions {
  readonly config: GatewayClientConfig & { readonly supabaseUrl: string };
  readonly onSetCookie?: SessionCookieWriter | undefined;
}

/**
 * Verifies the auth-gateway session cookie the login proxy placed on this
 * origin. The access token is checked locally against the Supabase JWKS; when
 * it is missing or expired, the gateway rotates the session and the fresh
 * cookies are relayed to the caller.
 */
export async function verifyGatewaySession(
  cookieHeader: string | undefined,
  options: SessionVerifierOptions,
): Promise<AuthUser | null> {
  const names = sessionCookieNames(secureCookies(options.config.publicUrl));
  const accessToken = readCookieValue(cookieHeader, names.access);
  const refreshToken = readCookieValue(cookieHeader, names.refresh);
  if (!accessToken && !refreshToken) {
    return null;
  }

  const issuer = `${options.config.supabaseUrl}/auth/v1`;
  const jwksUrl = `${issuer}/.well-known/jwks.json`;

  if (accessToken) {
    const user = await verifyAccessToken(accessToken, { issuer, jwksUrl });
    if (user) {
      return user;
    }
  }

  if (!refreshToken) {
    return null;
  }

  const rotated = await new GatewayAuthClient(options.config).refresh(cookieHeader);
  if (rotated.status !== 200) {
    return null;
  }
  options.onSetCookie?.(rotated.setCookies);

  const rotatedAccess = readSetCookie(rotated.setCookies, names.access);
  if (rotatedAccess === null) {
    throw new AuthUpstreamUnavailableError("auth-gateway");
  }
  const refreshedUser = await verifyAccessToken(rotatedAccess, {
    issuer,
    jwksUrl,
  });
  if (!refreshedUser) {
    throw new AuthUpstreamUnavailableError("auth-gateway");
  }
  return refreshedUser;
}

function readSetCookie(
  setCookies: readonly string[],
  name: string,
): string | null {
  for (const cookie of setCookies) {
    const [pair] = cookie.split(";", 1);
    if (pair === undefined) {
      continue;
    }
    const separator = pair.indexOf("=");
    if (separator === -1 || pair.slice(0, separator).trim() !== name) {
      continue;
    }
    const value = pair.slice(separator + 1).trim();
    return value === "" ? null : value;
  }
  return null;
}
