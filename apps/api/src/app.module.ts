import { Module } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";
import type { TransitSelections } from "@mota/contracts/transit-settings";
import type {
  StoredUserSettings,
  UserSettingsRepository,
} from "@mota/db";
import {
  API_OPTIONS,
  AUTH_CONFIG,
  SESSION_VERIFIER,
  SETTINGS_REPOSITORY,
  type ApiOptions,
  type SessionVerifier,
  type UpstreamFetch,
} from "./app.tokens";
import { AuthController } from "./auth/auth.controller";
import { GatewayAuthController } from "./auth/gatewayAuth.controller";
import { verifyGatewaySession } from "./auth/session";
import { HealthController } from "./health/health.controller";
import { SettingsController } from "./settings/settings.controller";
import { TransitController } from "./transit/transit.controller";
import { TransitCatalogService } from "./transit/transitCatalog.service";
import { WebController } from "./web/web.controller";

const DEFAULT_CATALOG_REFRESH_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_CATALOG_RETRY_MS = 15 * 60 * 1_000;

class UnavailableSettingsRepository implements UserSettingsRepository {
  async find(_authUserId: string): Promise<StoredUserSettings | null> {
    throw new Error("Settings repository is not configured.");
  }
  async save(
    _authUserId: string,
    _expectedVersion: number,
    _selections: TransitSelections,
  ): Promise<StoredUserSettings> {
    throw new Error("Settings repository is not configured.");
  }
}

export interface AppModuleOptions {
  readonly upstreamFetch?: UpstreamFetch;
  readonly verifySession?: SessionVerifier;
  readonly settingsRepository?: UserSettingsRepository;
  readonly oauthConfig?: ApiOptions["oauthConfig"];
  readonly now?: (() => number) | undefined;
  readonly subwayArrivalUpstream?: string | undefined;
  readonly transitCatalogRefreshMs?: number | undefined;
  readonly transitCatalogRetryMs?: number | undefined;
  readonly warmTransitCatalogs?: boolean | undefined;
  readonly minimumBusCatalogItems?: number | undefined;
  readonly minimumSubwayCatalogItems?: number | undefined;
  readonly random?: (() => number) | undefined;
}

@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: Nest dynamic modules expose a static registration factory.
export class AppModule {
  static register(options: AppModuleOptions = {}): DynamicModule {
    const oauthConfig = options.oauthConfig ?? null;
    const verifySession: SessionVerifier =
      options.verifySession ??
      (oauthConfig === null
        ? unconfiguredSessionVerifier
        : (cookie, onSetCookie) =>
            verifyGatewaySession(cookie, {
              config: oauthConfig,
              onSetCookie,
            }));
    const apiOptions: ApiOptions = {
      upstreamFetch: options.upstreamFetch ?? fetch,
      verifySession,
      settingsRepository:
        options.settingsRepository ?? new UnavailableSettingsRepository(),
      oauthConfig,
      now: options.now,
      subwayArrivalUpstream: options.subwayArrivalUpstream,
      transitCatalog: {
        refreshMs:
          options.transitCatalogRefreshMs ?? DEFAULT_CATALOG_REFRESH_MS,
        retryMs: options.transitCatalogRetryMs ?? DEFAULT_CATALOG_RETRY_MS,
        warmup: options.warmTransitCatalogs ?? false,
        minimumBusItems: options.minimumBusCatalogItems ?? 1,
        minimumSubwayItems: options.minimumSubwayCatalogItems ?? 1,
        random: options.random ?? Math.random,
      },
    };
    return {
      module: AppModule,
      controllers: [
        HealthController,
        AuthController,
        GatewayAuthController,
        SettingsController,
        TransitController,
        WebController,
      ],
      providers: [
        { provide: API_OPTIONS, useValue: apiOptions },
        { provide: SESSION_VERIFIER, useValue: apiOptions.verifySession },
        {
          provide: SETTINGS_REPOSITORY,
          useValue: apiOptions.settingsRepository,
        },
        { provide: AUTH_CONFIG, useValue: apiOptions.oauthConfig },
        TransitCatalogService,
      ],
    };
  }
}

const unconfiguredSessionVerifier: SessionVerifier = () => {
  throw new Error("Supabase auth is not configured.");
};
