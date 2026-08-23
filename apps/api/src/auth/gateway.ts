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

export type SessionVerifier = (
  cookieHeader: string | undefined,
) => Promise<GatewayUser | null>;

interface GatewayVerifierOptions {
  readonly baseUrl?: string;
  readonly fetcher?: typeof fetch;
}

export class GatewayUnavailableError extends Error {
  constructor() {
    super("Auth gateway is unavailable.");
    this.name = "GatewayUnavailableError";
  }
}

function accessTokenFrom(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) {
    return null;
  }
  for (const pair of cookieHeader.split(";")) {
    const [name, ...valueParts] = pair.trim().split("=");
    if (name === "agw-access") {
      const value = valueParts.join("=");
      return value ? decodeURIComponent(value) : null;
    }
  }
  return null;
}

export async function verifyGatewaySession(
  cookieHeader: string | undefined,
  options: GatewayVerifierOptions = {},
): Promise<GatewayUser | null> {
  const token = accessTokenFrom(cookieHeader);
  if (!token) {
    return null;
  }
  const baseUrl =
    options.baseUrl ??
    process.env.AUTH_GATEWAY_URL ??
    "http://auth-gateway:3000";
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher(`${baseUrl.replace(/\/$/, "")}/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new GatewayUnavailableError();
  }
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
