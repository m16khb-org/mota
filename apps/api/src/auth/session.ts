import type { AuthUser } from "@mota/contracts/auth";
import {
  readCookieValue,
  secureCookies,
  serializeSessionCookies,
  sessionCookieNames,
} from "./sessionCookies";
import {
  SupabaseAuthClient,
  SupabaseAuthError,
  SupabaseUnavailableError,
  type SupabaseClientConfig,
  type SupabaseSession,
} from "./supabaseClient";
import { verifyAccessToken } from "./supabaseJwt";

export type SessionCookieWriter = (cookies: readonly string[]) => void;

export interface SessionVerifierOptions {
  readonly config: SupabaseClientConfig & { readonly publicUrl: string };
  readonly onSetCookie?: SessionCookieWriter | undefined;
}

/**
 * Verifies the mota session cookies: the access token is checked locally
 * against the Supabase JWKS; when it is missing or expired, the refresh
 * cookie rotates the session server-side and relays the fresh cookies to
 * the caller. Gateway cookies are host-only and never reach this service,
 * so mota owns its host-only session end to end.
 */
export async function verifySupabaseSession(
  cookieHeader: string | undefined,
  options: SessionVerifierOptions,
): Promise<AuthUser | null> {
  const secure = secureCookies(options.config.publicUrl);
  const names = sessionCookieNames(secure);
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

  const client = new SupabaseAuthClient(options.config);
  let session: SupabaseSession;
  try {
    session = await client.refresh(refreshToken);
  } catch (error) {
    if (error instanceof SupabaseAuthError) {
      return null;
    }
    throw error;
  }
  options.onSetCookie?.(serializeSessionCookies(secure, session));
  const refreshedUser = await verifyAccessToken(session.access_token, {
    issuer,
    jwksUrl,
  });
  if (!refreshedUser) {
    throw new SupabaseUnavailableError();
  }
  return refreshedUser;
}
