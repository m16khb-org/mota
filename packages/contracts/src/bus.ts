import { z } from "zod";

const StopIdSchema = z.coerce.string().min(1).brand<"StopId">();
const ArsIdSchema = z.preprocess(
  (value) => String(value).padStart(5, "0"),
  z.string().regex(/^\d{5}$/).brand<"ArsId">(),
);
const RouteIdSchema = z.coerce.string().min(1).brand<"RouteId">();

export type StopId = z.infer<typeof StopIdSchema>;
export type ArsId = z.infer<typeof ArsIdSchema>;
export type RouteId = z.infer<typeof RouteIdSchema>;
export type CommuteDirection = "company" | "home";

export interface BusStop {
  readonly id: StopId;
  readonly arsId: ArsId;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  readonly distanceMeters: number;
}

export type Congestion = "여유" | "보통" | "혼잡" | "매우 혼잡";

export interface ArrivalEstimate {
  readonly message: string;
  readonly seconds: number | null;
  readonly remainingStops: number | null;
  readonly congestion: Congestion | null;
}

export interface BusArrival {
  readonly routeId: RouteId;
  readonly routeName: string;
  readonly direction: string;
  readonly routeType: string;
  readonly lowFloor: boolean;
  readonly first: ArrivalEstimate;
  readonly second: ArrivalEstimate | null;
}

export const busStopSchema = z.object({
  id: StopIdSchema,
  arsId: ArsIdSchema,
  name: z.string().min(1),
  lat: z.number().finite(),
  lng: z.number().finite(),
  distanceMeters: z.number().nonnegative(),
});

const nearbyStopSchema = z.object({
  strid: StopIdSchema,
  strnm: z.string().min(1),
  strno: ArsIdSchema,
  diffMeter: z.coerce.number().nonnegative(),
  posX: z.coerce.number().finite(),
  posY: z.coerce.number().finite(),
});

const nearbyResponseSchema = z.object({
  ResponseVO: z.object({
    data: z.object({
      resultList: z.array(nearbyStopSchema),
    }),
  }),
});

const rawArrivalSchema = z
  .object({
    busRouteId: RouteIdSchema,
    rtNm: z.string().min(1),
    adirection: z.string().default("방향 정보 없음"),
    arrmsg1: z.string().default("운행 정보 없음"),
    arrmsg2: z.string().default(""),
    arrmsgSec1: z.string().default(""),
    arrmsgSec2: z.string().default(""),
    sectOrd1: z.string().default(""),
    sectOrd2: z.string().default(""),
    routeType: z.string().default(""),
    busType1: z.string().default("0"),
    congetion1: z.string().default("0"),
  })
  .passthrough();

const arrivalResponseSchema = z.object({
  resultList: z.array(rawArrivalSchema),
});

export function normalizeNearbyStops(input: unknown): BusStop[] {
  const parsed = nearbyResponseSchema.parse(input);

  return parsed.ResponseVO.data.resultList.map((stop) => ({
    id: stop.strid,
    arsId: stop.strno,
    name: stop.strnm,
    lat: stop.posY,
    lng: stop.posX,
    distanceMeters: stop.diffMeter,
  }));
}

export function parseArrivalSeconds(message: string): number | null {
  if (/곧\s*도착|도착\s*임박/.test(message)) {
    return 30;
  }

  const minuteMatch = message.match(/(\d+)\s*분/);
  const secondMatch = message.match(/(\d+)\s*초/);
  if (minuteMatch?.[1] || secondMatch?.[1]) {
    return Number(minuteMatch?.[1] ?? 0) * 60 + Number(secondMatch?.[1] ?? 0);
  }

  return null;
}

function parseRemainingStops(message: string): number | null {
  const match = message.match(/\[(\d+)번째\s*전\]/);
  return match?.[1] ? Number(match[1]) : null;
}

function parseCongestion(value: string): Congestion | null {
  switch (value) {
    case "3":
      return "여유";
    case "4":
      return "보통";
    case "5":
      return "혼잡";
    case "6":
      return "매우 혼잡";
    default:
      return null;
  }
}

function normalizeEstimate(
  message: string,
  congestion: Congestion | null,
): ArrivalEstimate {
  return {
    message,
    seconds: parseArrivalSeconds(message),
    remainingStops: parseRemainingStops(message),
    congestion,
  };
}

export function normalizeArrivals(input: unknown): BusArrival[] {
  const parsed = arrivalResponseSchema.parse(input);

  return parsed.resultList
    .map((arrival): BusArrival => {
      const congestion = parseCongestion(arrival.congetion1);
      const second =
        arrival.arrmsg2 && arrival.arrmsg2 !== "운행종료"
          ? normalizeEstimate(arrival.arrmsg2, null)
          : null;

      return {
        routeId: arrival.busRouteId,
        routeName: arrival.rtNm,
        direction: arrival.adirection,
        routeType: arrival.routeType,
        lowFloor: arrival.busType1 === "1",
        first: normalizeEstimate(arrival.arrmsg1, congestion),
        second,
      };
    })
    .sort((left, right) => {
      const leftEta = left.first.seconds ?? Number.POSITIVE_INFINITY;
      const rightEta = right.first.seconds ?? Number.POSITIVE_INFINITY;
      return leftEta - rightEta || left.routeName.localeCompare(right.routeName, "ko");
    });
}

export const nearbySearchSchema = z.object({
  lat: z.coerce.number().min(37.3).max(37.8),
  lng: z.coerce.number().min(126.7).max(127.3),
  radius: z.coerce.number().int().min(100).max(1500).default(800),
});

export const arrivalLookupSchema = z.object({
  arsId: ArsIdSchema,
});
