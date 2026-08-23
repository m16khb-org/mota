import type { UserSettingsRepository } from "@mota/db";
import type { SessionVerifier } from "./auth/gateway";

export type UpstreamFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface ApiOptions {
  readonly upstreamFetch: UpstreamFetch;
  readonly verifySession: SessionVerifier;
  readonly settingsRepository: UserSettingsRepository;
  readonly now?: (() => number) | undefined;
  readonly sleep?: ((ms: number) => Promise<void>) | undefined;
  readonly subwayArrivalUpstream?: string | undefined;
}

export const API_OPTIONS = Symbol("API_OPTIONS");
export const SETTINGS_REPOSITORY = Symbol("SETTINGS_REPOSITORY");
export const SESSION_VERIFIER = Symbol("SESSION_VERIFIER");
