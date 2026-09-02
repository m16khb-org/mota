import { parse } from "cookie";

const ACCESS_COOKIE = "agw-access";
const REFRESH_COOKIE = "agw-refresh";

export interface SessionCookieNames {
  readonly access: string;
  readonly refresh: string;
}

export function secureCookies(publicUrl: string): boolean {
  return new URL(publicUrl).protocol === "https:";
}

/**
 * The auth-gateway sets these on mota's own origin through the login proxy.
 * Production carries the `__Host-` prefix; plain HTTP development drops it.
 */
export function sessionCookieNames(secure: boolean): SessionCookieNames {
  const prefix = secure ? "__Host-" : "";
  return {
    access: `${prefix}${ACCESS_COOKIE}`,
    refresh: `${prefix}${REFRESH_COOKIE}`,
  };
}

export function readCookieValue(
  cookieHeader: string | undefined,
  name: string,
): string | null {
  if (!cookieHeader) {
    return null;
  }
  const value = parse(cookieHeader)[name];
  return typeof value === "string" && value !== "" ? value : null;
}
