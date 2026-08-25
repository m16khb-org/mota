import {
  BadGatewayException,
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  Query,
} from "@nestjs/common";
import {
  arrivalLookupSchema,
  nearbySearchSchema,
} from "@mota/contracts/bus";
import {
  subwayArrivalLookupSchema,
  subwaySearchSchema,
} from "@mota/contracts/subway";
import { API_OPTIONS, type ApiOptions } from "../app.tokens";
import { fetchArrivals } from "../upstream/seoulBus";
import { fetchSubwayArrivals } from "../upstream/subwayArrivals";
import { errorDetail } from "../upstream/upstreamError";
import { TransitCatalogService } from "./transitCatalog.service";

@Controller("api")
export class TransitController {
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
    try {
      return await fetchSubwayArrivals(
        this.options.upstreamFetch,
        query.data.station,
        this.options.subwayArrivalUpstream,
      );
    } catch (error) {
      throw TransitController.upstreamError(
        "지하철 도착 정보를 불러오지 못했습니다.",
        error,
      );
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

  private static upstreamError(message: string, error: unknown) {
    return new BadGatewayException({
      error: "UPSTREAM_UNAVAILABLE",
      message,
      detail: errorDetail(error),
    });
  }
}
