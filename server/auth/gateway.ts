import { createRemoteJWKSet, jwtVerify } from "jose";

export interface GwUser {
  readonly sub: string;
  readonly email?: string;
}

const defaultSupabaseUrl = "https://mionqcczituwkryrjsfh.supabase.co";
const supabaseUrl = (typeof Bun !== "undefined"
  ? Bun.env.AUTH_GATEWAY_SUPABASE_URL
  : undefined) ?? defaultSupabaseUrl;
const issuer = `${supabaseUrl.replace(/\/+$/, "")}/auth/v1`;
const jwks = createRemoteJWKSet(
  new URL(`${issuer}/.well-known/jwks.json`),
);

function readCookie(
  cookieHeader: string | undefined,
  name: string,
): string | undefined {
  if (cookieHeader === undefined) return undefined;

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    if (key === name) return part.slice(separator + 1).trim();
  }

  return undefined;
}

export async function verifyGatewaySession(
  cookieHeader: string | undefined,
): Promise<GwUser | null> {
  const token = readCookie(cookieHeader, "agw-access");
  if (token === undefined || token.length === 0) return null;

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      clockTolerance: 5,
    });
    if (payload.role !== "authenticated" || typeof payload.sub !== "string") {
      return null;
    }

    return {
      sub: payload.sub,
      ...(typeof payload.email === "string" ? { email: payload.email } : {}),
    };
  } catch {
    return null;
  }
}
