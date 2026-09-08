import {
  BadGatewayException,
  BadRequestException,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Query,
} from "@nestjs/common";
import {
  arrivalLookupSchema,
  nearbySearchSchema,
} from "@mota/contracts/bus";
import {
  apiStationName,
  subwayArrivalLookupSchema,
  subwaySearchSchema,
} from "@mota/contracts/subway";
import {
  SUBWAY_QUOTA_COOLDOWN_MS,
} from "@mota/db";
import { API_OPTIONS, type ApiOptions } from "../app.tokens";
import { fetchArrivals } from "../upstream/seoulBus";
import { fetchSubwayArrivals } from "../upstream/subwayArrivals";
import {
  errorDetail,
  isSeoulSubwayQuotaError,
} from "../upstream/upstreamError";
import { deniedRequest, SubwayRequestDeniedError } from "../quota/subwayQuota";
import { TransitCatalogService } from "./transitCatalog.service";

@Controller("api")
export class TransitController {
  private subwayQuotaBlockedUntil: number | null = null;
  private readonly subwayArrivalInFlight = new Map<
    string,
    Promise<Awaited<ReturnType<typeof fetchSubwayArrivals>>>
  >();

  constructor(
    @Inject(API_OPTIONS) private readonly options: ApiOptions,
    @Inject(TransitCatalogService)
    private readonly catalogs: TransitCatalogService,
  ) {}

  @Get("stops/nearby")
  async nearbyStops(@Query() queryValue: unknown) {
    const query = nearbySearchSchema.safeParse(queryValue);
    if (!query.success) {
      throw new BadRequestException({
        error: "INVALID_LOCATION",
        message: "서울 서비스 범위의 위도, 경도, 반경을 입력해 주세요.",
      });
    }
    try {
      return {
        stops: await this.catalogs.nearbyStops(query.data),
      };
    } catch (error) {
      throw TransitController.upstreamError(
        "정류장 정보를 불러오지 못했습니다.",
        error,
      );
    }
  }

  @Get("subway/nearby")
  async nearbySubway(@Query() queryValue: unknown) {
    const query = subwaySearchSchema.safeParse(queryValue);
    if (!query.success) {
      throw new BadRequestException({
        error: "INVALID_LOCATION",
        message: "서울 서비스 범위의 위도, 경도, 반경을 입력해 주세요.",
      });
    }
    try {
      return {
        stations: await this.catalogs.nearbySubway(query.data),
      };
    } catch (error) {
      throw TransitController.upstreamError(
        "지하철역 정보를 불러오지 못했습니다.",
        error,
      );
    }
  }

  @Get("subway/arrivals")
  async subwayArrivals(@Query() queryValue: unknown) {
    const query = subwayArrivalLookupSchema.safeParse(queryValue);
    if (!query.success) {
      throw new BadRequestException({
        error: "INVALID_STATION",
        message: "역 이름을 입력해 주세요.",
      });
    }
    const key = apiStationName(query.data.station);
    const existing = this.subwayArrivalInFlight.get(key);
    if (existing) {
      try {
        return await existing;
      } catch (error) {
        throw TransitController.arrivalError(error);
      }
    }

    const request = this.fetchSubwayArrival(query.data.station);
    this.subwayArrivalInFlight.set(key, request);
    try {
      return await request;
    } catch (error) {
      throw TransitController.arrivalError(error);
    } finally {
      if (this.subwayArrivalInFlight.get(key) === request) {
        this.subwayArrivalInFlight.delete(key);
      }
    }
  }

  private async fetchSubwayArrival(station: string) {
    const budget = this.options.subwayRequestBudget;
    const scopeHash = this.options.subwayApiKeyScope;
    const now = this.options.now?.() ?? Date.now();
    if (this.subwayQuotaBlockedUntil !== null) {
      if (now < this.subwayQuotaBlockedUntil) {
        throw new SubwayRequestDeniedError(
          "cooldown",
          this.subwayQuotaBlockedUntil,
        );
      }
      this.subwayQuotaBlockedUntil = null;
    }
    if (budget && scopeHash) {
      const decision = await budget.reserveArrival(scopeHash, now);
      if (!decision.allowed) {
        throw deniedRequest(decision);
      }
    }

    try {
      return await fetchSubwayArrivals(
        this.options.upstreamFetch,
        station,
        this.options.subwayArrivalUpstream,
      );
    } catch (error) {
      if (budget && scopeHash && isSeoulSubwayQuotaError(error)) {
        const cooldownUntil = now + SUBWAY_QUOTA_COOLDOWN_MS;
        this.subwayQuotaBlockedUntil = cooldownUntil;
        try {
          await budget.markQuotaExhausted(scopeHash, now);
        } catch (persistenceError) {
          console.error(
            "Failed to persist Seoul subway quota cooldown.",
            persistenceError,
          );
        }
        throw new SubwayRequestDeniedError("cooldown", cooldownUntil);
      }
      throw error;
    }
  }

  @Get("arrivals/:arsId")
  async busArrivals(@Param() paramsValue: unknown) {
    const params = arrivalLookupSchema.safeParse(paramsValue);
    if (!params.success) {
      throw new BadRequestException({
        error: "INVALID_ARS_ID",
        message: "ARS 번호는 5자리 숫자여야 합니다.",
      });
    }
    try {
      return {
        arrivals: await fetchArrivals(
          this.options.upstreamFetch,
          params.data.arsId,
        ),
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      throw TransitController.upstreamError(
        "실시간 도착 정보를 불러오지 못했습니다.",
        error,
      );
    }
  }

  private static arrivalError(error: unknown) {
    if (error instanceof SubwayRequestDeniedError) {
      return new HttpException({
        error: error.code,
        message: error.message,
        ...(error.retryAt === null
          ? {}
          : { retryAt: new Date(error.retryAt).toISOString() }),
      }, HttpStatus.TOO_MANY_REQUESTS);
    }
    return TransitController.upstreamError(
      "지하철 도착 정보를 불러오지 못했습니다.",
      error,
    );
  }

  private static upstreamError(message: string, error: unknown) {
    return new BadGatewayException({
      error: "UPSTREAM_UNAVAILABLE",
      message,
      detail: errorDetail(error),
    });
  }
}
