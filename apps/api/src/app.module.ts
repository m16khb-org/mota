import { Module } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";
import type { TransitSelections } from "@mota/contracts/transit-settings";
import type {
  StoredUserSettings,
  UserSettingsRepository,
} from "@mota/db";
import {
  API_OPTIONS,
  SESSION_VERIFIER,
  SETTINGS_REPOSITORY,
  type ApiOptions,
  type UpstreamFetch,
} from "./app.tokens";
import { AuthController } from "./auth/auth.controller";
import {
  verifyGatewaySession,
  type SessionVerifier,
} from "./auth/gateway";
import { HealthController } from "./health/health.controller";
import { SettingsController } from "./settings/settings.controller";
import { TransitController } from "./transit/transit.controller";
import { WebController } from "./web/web.controller";

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
  readonly now?: (() => number) | undefined;
  readonly sleep?: ((ms: number) => Promise<void>) | undefined;
  readonly subwayArrivalUpstream?: string | undefined;
}

@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: Nest dynamic modules expose a static registration factory.
export class AppModule {
  static register(options: AppModuleOptions = {}): DynamicModule {
    const apiOptions: ApiOptions = {
      upstreamFetch: options.upstreamFetch ?? fetch,
      verifySession: options.verifySession ?? verifyGatewaySession,
      settingsRepository:
        options.settingsRepository ?? new UnavailableSettingsRepository(),
      now: options.now,
      sleep: options.sleep,
      subwayArrivalUpstream: options.subwayArrivalUpstream,
    };
    return {
      module: AppModule,
      controllers: [
        HealthController,
        AuthController,
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
      ],
    };
  }
}
