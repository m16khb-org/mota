import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import type { BusStop } from "@mota/contracts/bus";
import type {
  SubwayStation,
  SubwayStationPoint,
} from "@mota/contracts/subway";
import { API_OPTIONS, type ApiOptions } from "../app.tokens";
import { fetchSubwayStationCatalog } from "../upstream/officialSubwayStations";
import { fetchStopCatalog } from "../upstream/seoulBus";
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
  private readonly subway: ManagedCatalog<SubwayStationPoint>;

  constructor(@Inject(API_OPTIONS) options: ApiOptions) {
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
    this.subway = new ManagedCatalog({
      ...common,
      source: "subway",
      minimumItems: options.transitCatalog.minimumSubwayItems,
      loader: () => fetchSubwayStationCatalog(options.upstreamFetch),
    });
  }

  onModuleInit() {
    this.bus.start();
    this.subway.start();
  }

  onModuleDestroy() {
    this.bus.stop();
    this.subway.stop();
  }

  async nearbyStops(location: Location): Promise<BusStop[]> {
    const points = await this.bus.read();
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

  async nearbySubway(location: Location): Promise<SubwayStation[]> {
    const byName = new Map<string, SubwayStation>();
    for (const point of await this.subway.read()) {
      const exactDistance = distanceMeters(location, point);
      if (exactDistance > location.radius) {
        continue;
      }
      const station = {
        ...point,
        distanceMeters: Math.round(exactDistance),
      };
      const current = byName.get(point.name);
      if (!current || station.distanceMeters < current.distanceMeters) {
        byName.set(point.name, station);
      }
    }
    return [...byName.values()].sort(
      (left, right) =>
        left.distanceMeters - right.distanceMeters ||
        left.name.localeCompare(right.name, "ko"),
    );
  }

  async refreshDueCatalogs() {
    return Promise.allSettled([
      this.bus.refreshIfDue(),
      this.subway.refreshIfDue(),
    ]);
  }

  status(): {
    readonly bus: CatalogStatus;
    readonly subway: CatalogStatus;
  } {
    return {
      bus: this.bus.status(),
      subway: this.subway.status(),
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
