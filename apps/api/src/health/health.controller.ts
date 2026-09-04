import { Controller, Get, Inject } from "@nestjs/common";
import type { TransitMapHealth } from "@mota/contracts/transit-map";
import { SubwayPositionCollector } from "../transit-map/subwayPositionCollector";
import {
  BUS_POSITION_SOURCE,
  type BusPositionSource,
} from "../transit-map/transitMapStream.service";
import { TransitCatalogService } from "../transit/transitCatalog.service";

@Controller("api/health")
export class HealthController {
  constructor(
    @Inject(TransitCatalogService)
    private readonly catalogs: TransitCatalogService,
    @Inject(SubwayPositionCollector)
    private readonly subwayPositions: SubwayPositionCollector,
    @Inject(BUS_POSITION_SOURCE)
    private readonly busPositions: BusPositionSource,
  ) {}

  @Get()
  health() {
    return {
      status: "ok",
      service: "mota",
      transitCatalogs: this.catalogs.status(),
      liveTransit: {
        subway: this.subwayPositions.status(),
        bus: this.busPositions.status?.() ?? emptyBusHealth(),
      },
    };
  }
}

function emptyBusHealth(): TransitMapHealth["bus"] {
  return {
    status: "unavailable",
    successCount: 0,
    failureCount: 0,
    consecutiveFailures: 0,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastDurationMs: null,
  };
}
