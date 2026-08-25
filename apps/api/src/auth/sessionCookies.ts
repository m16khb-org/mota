import { parse, serialize } from "cookie";

const ACCESS_COOKIE = "mota-access";
const REFRESH_COOKIE = "mota-refresh";
const VERIFIER_COOKIE = "mota-oauth-verifier";
const STATE_COOKIE = "mota-oauth-state";
const RETURN_URL_COOKIE = "mota-return-url";

const REFRESH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const FLOW_COOKIE_MAX_AGE_SECONDS = 600;

export interface SessionCookieNames {
  readonly access: string;
  readonly refresh: string;
}

export interface FlowCookieNames {
  readonly verifier: string;
  readonly state: string;
  readonly returnUrl: string;
}

interface CookieOptions {
  readonly httpOnly: true;
  readonly sameSite: "lax";
  readonly secure: boolean;
  readonly path: "/";
}

export function secureCookies(publicUrl: string): boolean {
  return new URL(publicUrl).protocol === "https:";
}

export function sessionCookieNames(secure: boolean): SessionCookieNames {
  const prefix = secure ? "__Host-" : "";
  return {
    access: `${prefix}${ACCESS_COOKIE}`,
    refresh: `${prefix}${REFRESH_COOKIE}`,
  };
}

export function flowCookieNames(secure: boolean): FlowCookieNames {
  const prefix = secure ? "__Host-" : "";
  return {
    verifier: `${prefix}${VERIFIER_COOKIE}`,
    state: `${prefix}${STATE_COOKIE}`,
    returnUrl: `${prefix}${RETURN_URL_COOKIE}`,
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

export function serializeSessionCookies(
  secure: boolean,
  session: {
    readonly access_token: string;
    readonly refresh_token: string;
    readonly expires_in: number;
  },
): string[] {
  const names = sessionCookieNames(secure);
  const options = cookieOptions(secure);
  return [
    serialize(names.access, session.access_token, {
      ...options,
      maxAge: session.expires_in,
    }),
    serialize(names.refresh, session.refresh_token, {
      ...options,
      maxAge: REFRESH_COOKIE_MAX_AGE_SECONDS,
    }),
  ];
}

export function serializeFlowCookies(
  secure: boolean,
  flow: {
    readonly verifier: string;
    readonly state: string;
    readonly returnUrl: string;
  },
): string[] {
  const names = flowCookieNames(secure);
  const options = cookieOptions(secure);
  return [
    serialize(names.verifier, flow.verifier, {
      ...options,
      maxAge: FLOW_COOKIE_MAX_AGE_SECONDS,
    }),
    serialize(names.state, flow.state, {
      ...options,
      maxAge: FLOW_COOKIE_MAX_AGE_SECONDS,
    }),
    serialize(names.returnUrl, flow.returnUrl, {
      ...options,
      maxAge: FLOW_COOKIE_MAX_AGE_SECONDS,
    }),
  ];
}

export function clearFlowCookieStrings(secure: boolean): string[] {
  const names = flowCookieNames(secure);
  return [names.verifier, names.state, names.returnUrl].map((name) =>
    serialize(name, "", { ...cookieOptions(secure), maxAge: 0 }),
  );
}

export function clearSessionCookieStrings(secure: boolean): string[] {
  const names = sessionCookieNames(secure);
  return [names.access, names.refresh].map((name) =>
    serialize(name, "", { ...cookieOptions(secure), maxAge: 0 }),
  );
}

function cookieOptions(secure: boolean): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
  };
}
