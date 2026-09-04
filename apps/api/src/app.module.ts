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
  type RepeatingScheduler,
} from "./app.tokens";
import { AuthController } from "./auth/auth.controller";
import { GatewayAuthController } from "./auth/gatewayAuth.controller";
import { verifyGatewaySession } from "./auth/session";
import { HealthController } from "./health/health.controller";
import { SettingsController } from "./settings/settings.controller";
import { TransitController } from "./transit/transit.controller";
import { TransitCatalogService } from "./transit/transitCatalog.service";
import { TransitMapController } from "./transit-map/transitMap.controller";
import {
  BUS_TOPOLOGY_PORT,
  EmptyBusTopologyPort,
  TRANSIT_MAP_NETWORK_OPTIONS,
  type BusTopologyPort,
  TransitMapNetworkService,
} from "./transit-map/transitMapNetwork.service";
import { SubwayPositionCollector } from "./transit-map/subwayPositionCollector";
import { BusPositionCollectorRegistry } from "./transit-map/busPositionCollectorRegistry";
import {
  BUS_POSITION_SOURCE,
  EmptyBusPositionSource,
  type BusPositionSource,
  TransitMapStreamService,
} from "./transit-map/transitMapStream.service";
import { fetchSubwayPositions } from "./upstream/subwayPositions";
import {
  fetchBusPositions,
  OfficialBusTopologyPort,
} from "./upstream/seoulBusPositions";
import { WebController } from "./web/web.controller";

const DEFAULT_CATALOG_REFRESH_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_CATALOG_RETRY_MS = 15 * 60 * 1_000;
const LIVE_SUBWAY_LINES = [
  "1호선",
  "2호선",
  "3호선",
  "4호선",
  "5호선",
  "6호선",
  "7호선",
  "8호선",
  "9호선",
  "경의중앙선",
  "공항철도",
  "경춘선",
  "수인분당선",
  "신분당선",
  "경강선",
  "서해선",
  "GTX-A",
] as const;

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
  readonly busMapConfigured?: boolean | undefined;
  readonly busTopology?: BusTopologyPort | undefined;
  readonly busPositionSource?: BusPositionSource | undefined;
  readonly subwayPositionTemplate?: string | undefined;
  readonly repeatingScheduler?: RepeatingScheduler | undefined;
  readonly busApiKey?: string | undefined;
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
    const scheduler = options.repeatingScheduler ?? new IntervalScheduler();
    const subwayPositionTemplate = options.subwayPositionTemplate;
    const busApiKey = options.busApiKey;
    const officialBusTopology = busApiKey
      ? new OfficialBusTopologyPort(
          apiOptions.upstreamFetch,
          busApiKey,
          options.now ?? Date.now,
        )
      : null;
    const busTopology =
      options.busTopology ?? officialBusTopology ?? new EmptyBusTopologyPort();
    const subwayPositions = new SubwayPositionCollector({
      lines: LIVE_SUBWAY_LINES,
      loadLine: subwayPositionTemplate
        ? (line) =>
            fetchSubwayPositions(
              apiOptions.upstreamFetch,
              subwayPositionTemplate,
              line,
            )
        : async () => {
            throw new Error("Subway position API is not configured.");
      },
      scheduler,
      ...(options.now ? { now: options.now } : {}),
    });
    const busPositions =
      options.busPositionSource ??
      (officialBusTopology && busApiKey
        ? new BusPositionCollectorRegistry({
            scheduler,
            ...(options.now ? { now: options.now } : {}),
            loadRoute: (routeId) => {
              const route = officialBusTopology.routeSummary(routeId);
              if (!route) {
                throw new Error("Bus route was not discovered for this viewport.");
              }
              return fetchBusPositions(
                apiOptions.upstreamFetch,
                busApiKey,
                route,
                { west: 126.7, south: 37.3, east: 127.3, north: 37.8 },
                options.now ?? Date.now,
              );
            },
          })
        : new EmptyBusPositionSource());
    return {
      module: AppModule,
      controllers: [
        HealthController,
        AuthController,
        GatewayAuthController,
        SettingsController,
        TransitController,
        TransitMapController,
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
        TransitMapNetworkService,
        { provide: SubwayPositionCollector, useValue: subwayPositions },
        { provide: BUS_POSITION_SOURCE, useValue: busPositions },
        {
          provide: TransitMapStreamService,
          inject: [TransitMapNetworkService],
          useFactory: (networks: TransitMapNetworkService) =>
            new TransitMapStreamService(
              networks,
              subwayPositions,
              busPositions,
              scheduler,
              options.now ?? Date.now,
            ),
        },
        {
          provide: BUS_TOPOLOGY_PORT,
          useValue: busTopology,
        },
        {
          provide: TRANSIT_MAP_NETWORK_OPTIONS,
          useValue: {
            busConfigured: options.busMapConfigured ?? Boolean(options.busApiKey),
          },
        },
      ],
    };
  }
}

const unconfiguredSessionVerifier: SessionVerifier = () => {
  throw new Error("Supabase auth is not configured.");
};

class IntervalScheduler implements RepeatingScheduler {
  every(intervalMs: number, task: () => Promise<void>) {
    let running = false;
    const timer = setInterval(() => {
      if (running) return;
      running = true;
      void task().finally(() => {
        running = false;
      });
    }, intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  }
}
