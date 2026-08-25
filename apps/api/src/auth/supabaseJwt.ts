import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import type { AuthUser } from "@mota/contracts/auth";
import { SupabaseUnavailableError } from "./supabaseClient";

const SUPABASE_USER_ROLE = "authenticated" as const;

const claimsSchema = z.object({
  sub: z.string().min(1),
  role: z.literal(SUPABASE_USER_ROLE),
  email: z.string().email().optional(),
});

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function isJoseError(error: unknown): boolean {
  const code = (error as { readonly code?: unknown }).code;
  return typeof code === "string" && code.startsWith("ERR_");
}

function jwksFor(jwksUrl: string): ReturnType<typeof createRemoteJWKSet> {
  const cached = jwksCache.get(jwksUrl);
  if (cached) {
    return cached;
  }
  const created = createRemoteJWKSet(new URL(jwksUrl));
  jwksCache.set(jwksUrl, created);
  return created;
}

/**
 * Verifies a Supabase access token locally against the project JWKS —
 * the same rules the auth-gateway enforces (ES256, issuer, audience,
 * role === "authenticated"). Returns null for invalid or expired tokens.
 */
export async function verifyAccessToken(
  token: string,
  options: { readonly issuer: string; readonly jwksUrl: string },
): Promise<AuthUser | null> {
  let payload: unknown;
  try {
    const verified = await jwtVerify(token, jwksFor(options.jwksUrl), {
      issuer: options.issuer,
      audience: SUPABASE_USER_ROLE,
      algorithms: ["ES256"],
      clockTolerance: 5,
    });
    payload = verified.payload;
  } catch (error) {
    if (isJoseError(error)) {
      return null;
    }
    throw new SupabaseUnavailableError();
  }
  const claims = claimsSchema.safeParse(payload);
  if (!claims.success) {
    return null;
  }
  return {
    sub: claims.data.sub,
    email: claims.data.email,
  };
}
