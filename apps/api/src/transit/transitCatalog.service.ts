import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import type { BusStop } from "@mota/contracts/bus";
import { API_OPTIONS, type ApiOptions } from "../app.tokens";
import {
  fetchNearbyStops as fetchLiveNearbyStops,
  fetchStopCatalog,
} from "../upstream/seoulBus";
import { UpstreamError } from "../upstream/upstreamError";
import {
  ManagedCatalog,
  type CatalogEvent,
  type CatalogStatus,
} from "./managedCatalog";

type Location = {
  readonly lat: number;
  readonly lng: number;
  readonly radius: number;
};
type BusStopPoint = Omit<BusStop, "distanceMeters">;

@Injectable()
export class TransitCatalogService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TransitCatalogService.name);
  private readonly bus: ManagedCatalog<BusStopPoint>;

  constructor(
    @Inject(API_OPTIONS) private readonly options: ApiOptions,
  ) {
    const now = options.now ?? Date.now;
    const schedule = options.transitCatalog.warmup;
    const common = {
      now,
      random: options.transitCatalog.random,
      refreshMs: options.transitCatalog.refreshMs,
      retryMs: options.transitCatalog.retryMs,
      schedule,
      onEvent: (event: CatalogEvent) => this.logEvent(event),
    };
    this.bus = new ManagedCatalog({
      ...common,
      source: "bus",
      minimumItems: options.transitCatalog.minimumBusItems,
      loader: async () => {
        const byId = new Map<string, BusStopPoint>();
        for (const { distanceMeters: _, ...stop } of await fetchStopCatalog(
          options.upstreamFetch,
        )) {
          byId.set(String(stop.id), stop);
        }
        return [...byId.values()];
      },
    });

  }

  onModuleInit() {
    this.bus.start();
  }

  onModuleDestroy() {
    this.bus.stop();
  }

  async nearbyStops(location: Location): Promise<BusStop[]> {
    let points: readonly BusStopPoint[];
    try {
      points = await this.bus.read();
    } catch (error) {
      if (error instanceof UpstreamError) {
        return fetchLiveNearbyStops(this.options.upstreamFetch, location);
      }
      throw error;
    }
    return points
      .map((point) => ({
        ...point,
        distanceMeters: distanceMeters(location, point),
      }))
      .filter((stop) => stop.distanceMeters <= location.radius)
      .sort(
        (left, right) =>
          left.distanceMeters - right.distanceMeters ||
          String(left.id).localeCompare(String(right.id)),
      )
      .map((stop) => ({
        ...stop,
        distanceMeters: Math.round(stop.distanceMeters),
      }));
  }

  async refreshDueCatalogs() {
    return Promise.allSettled([
      this.bus.refreshIfDue(),
    ]);
  }

  status(): {
    readonly bus: CatalogStatus;
  } {
    return {
      bus: this.bus.status(),
    };
  }

  private logEvent(event: CatalogEvent) {
    const message = JSON.stringify({
      event: "transit_catalog_refresh",
      ...event,
    });
    if (event.outcome === "failure") {
      this.logger.warn(message);
      return;
    }
    this.logger.log(message);
  }
}

function distanceMeters(
  center: { readonly lat: number; readonly lng: number },
  point: { readonly lat: number; readonly lng: number },
): number {
  const radians = Math.PI / 180;
  const latDelta = (point.lat - center.lat) * radians;
  const lngDelta = (point.lng - center.lng) * radians;
  const startLat = center.lat * radians;
  const endLat = point.lat * radians;
  const haversine =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(lngDelta / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(haversine));
}
