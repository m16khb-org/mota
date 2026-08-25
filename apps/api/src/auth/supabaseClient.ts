import { z } from "zod";

const supabaseSessionSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  token_type: z.string().min(1),
});

export type SupabaseSession = Readonly<z.infer<typeof supabaseSessionSchema>>;

export class SupabaseAuthError extends Error {
  constructor(reason: string) {
    super(`supabase auth endpoint failed: ${reason}`);
    this.name = "SupabaseAuthError";
  }
}

export class SupabaseUnavailableError extends Error {
  constructor() {
    super("Supabase auth is unavailable.");
    this.name = "SupabaseUnavailableError";
  }
}

export type AuthFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface SupabaseClientConfig {
  readonly supabaseUrl: string;
  readonly anonKey: string;
  readonly fetcher: AuthFetch;
}

export class SupabaseAuthClient {
  private readonly config: SupabaseClientConfig;

  constructor(config: SupabaseClientConfig) {
    this.config = config;
  }

  async exchangeCode(
    authCode: string,
    codeVerifier: string,
  ): Promise<SupabaseSession> {
    return this.requestSession("grant_type=pkce", {
      auth_code: authCode,
      code_verifier: codeVerifier,
    });
  }

  async refresh(refreshToken: string): Promise<SupabaseSession> {
    return this.requestSession("grant_type=refresh_token", {
      refresh_token: refreshToken,
    });
  }

  async revokeSession(
    accessToken: string,
    refreshToken: string,
  ): Promise<void> {
    let response: Response;
    try {
      response = await this.config.fetcher(
        `${this.config.supabaseUrl}/auth/v1/signout`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: this.config.anonKey,
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ refresh_token: refreshToken }),
          signal: AbortSignal.timeout(10_000),
        },
      );
    } catch {
      throw new SupabaseUnavailableError();
    }
    if (!response.ok) {
      throw new SupabaseAuthError("signout");
    }
  }

  private async requestSession(
    grantQuery: string,
    body: Record<string, string>,
  ): Promise<SupabaseSession> {
    let response: Response;
    try {
      response = await this.config.fetcher(
        `${this.config.supabaseUrl}/auth/v1/token?${grantQuery}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: this.config.anonKey,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10_000),
        },
      );
    } catch {
      throw new SupabaseUnavailableError();
    }
    if (!response.ok) {
      throw new SupabaseAuthError(grantQuery);
    }
    const parsed = supabaseSessionSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new SupabaseAuthError(grantQuery);
    }
    return parsed.data;
  }
}
