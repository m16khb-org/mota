import { Controller, Get, Inject } from "@nestjs/common";
import { TransitCatalogService } from "../transit/transitCatalog.service";

@Controller("api/health")
export class HealthController {
  constructor(
    @Inject(TransitCatalogService)
    private readonly catalogs: TransitCatalogService,
  ) {}

  @Get()
  health() {
    return {
      status: "ok",
      service: "mota",
      transitCatalogs: this.catalogs.status(),
    };
  }
}
