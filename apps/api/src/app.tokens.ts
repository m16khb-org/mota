import type { AuthUser } from "@mota/contracts/auth";
import type { UserSettingsRepository } from "@mota/db";

export type UpstreamFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type SessionVerifier = (
  cookieHeader: string | undefined,
  onSetCookie?: (cookies: readonly string[]) => void,
) => Promise<AuthUser | null>;

export interface ApiOptions {
  readonly upstreamFetch: UpstreamFetch;
  readonly verifySession: SessionVerifier;
  readonly settingsRepository: UserSettingsRepository;
  readonly oauthConfig: {
    readonly supabaseUrl: string;
    readonly anonKey: string;
    readonly publicUrl: string;
    readonly fetcher: UpstreamFetch;
  } | null;
  readonly now?: (() => number) | undefined;
  readonly sleep?: ((ms: number) => Promise<void>) | undefined;
  readonly subwayArrivalUpstream?: string | undefined;
}

export const API_OPTIONS = Symbol("API_OPTIONS");
export const SETTINGS_REPOSITORY = Symbol("SETTINGS_REPOSITORY");
export const SESSION_VERIFIER = Symbol("SESSION_VERIFIER");
export const AUTH_CONFIG = Symbol("AUTH_CONFIG");
