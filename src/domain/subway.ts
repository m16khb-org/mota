import { z } from "zod";

const SubwayStationIdSchema = z.string().min(1).brand<"SubwayStationId">();

export interface SubwayStation {
  readonly id: z.infer<typeof SubwayStationIdSchema>;
  readonly name: string;
  readonly line: string;
  readonly lat: number;
  readonly lng: number;
  readonly distanceMeters: number;
}

export const subwayStationSchema = z.object({
  id: SubwayStationIdSchema,
  name: z.string().min(1),
  line: z.string().min(1),
  lat: z.number().finite(),
  lng: z.number().finite(),
  distanceMeters: z.number().nonnegative(),
});

const overpassElementSchema = z.object({
  id: z.number().int(),
  type: z.enum(["node", "way", "relation"]),
  lat: z.number().finite().optional(),
  lon: z.number().finite().optional(),
  center: z
    .object({
      lat: z.number().finite(),
      lon: z.number().finite(),
    })
    .optional(),
  tags: z.record(z.string(), z.string()).default({}),
});

const overpassResponseSchema = z.object({
  elements: z.array(overpassElementSchema),
});

export const subwaySearchSchema = z.object({
  lat: z.coerce.number().min(37.3).max(37.8),
  lng: z.coerce.number().min(126.7).max(127.3),
  radius: z.coerce.number().int().min(300).max(5_000).default(3_000),
});

export const subwayArrivalLookupSchema = z.object({
  station: z.string().trim().min(1).max(20),
});

/** Seoul's arrival API registers some stations under parenthesized official
 * names while OpenStreetMap keeps the short form. */
const API_STATION_ALIASES: Readonly<Record<string, string>> = {
  천호: "천호(풍납토성)",
  군자: "군자(능동)",
  총신대입구: "총신대입구(이수)",
};

export function apiStationName(station: string): string {
  return API_STATION_ALIASES[station] ?? station;
}

export interface SubwayArrival {
  readonly id: string;
  readonly subwayId: string;
  readonly updnLine: string;
  readonly line: string;
  readonly direction: string;
  readonly trainLineNm: string;
  readonly trainStatus: string;
  readonly seconds: number | null;
  readonly message: string;
  readonly location: string | null;
  readonly isLastTrain: boolean;
}

export const subwayArrivalSchema = z.object({
  id: z.string().min(1),
  subwayId: z.string().min(1),
  updnLine: z.string().min(1),
  line: z.string().min(1),
  direction: z.string().min(1),
  trainLineNm: z.string().min(1),
  trainStatus: z.string().min(1),
  seconds: z.number().nullable(),
  message: z.string(),
  location: z.string().nullable(),
  isLastTrain: z.boolean(),
});

const SUBWAY_LINE_NAMES: Readonly<Record<string, string>> = {
  "1001": "1호선",
  "1002": "2호선",
  "1003": "3호선",
  "1004": "4호선",
  "1005": "5호선",
  "1006": "6호선",
  "1007": "7호선",
  "1008": "8호선",
  "1009": "9호선",
  "1063": "경의중앙선",
  "1065": "공항철도",
  "1067": "경춘선",
  "1075": "수인분당선",
  "1077": "신분당선",
};

/** OSM `ref` codes (numeric) and `line` tags ("수도권 전철") need
 * translation to Korean line names for display. */
const OSM_LINE_NAMES: Readonly<Record<string, string>> = {
  "1": "1호선",
  "2": "2호선",
  "3": "3호선",
  "4": "4호선",
  "5": "5호선",
  "6": "6호선",
  "7": "7호선",
  "8": "8호선",
  "9": "9호선",
  경의중앙: "경의중앙선",
  경춘: "경춘선",
  수인분당: "수인분당선",
  신분당: "신분당선",
  공항철도: "공항철도",
  서해: "서해선",
  김포: "김포골드라인",
  우이신설: "우이신설경전철",
  에버라인: "에버라인",
};

function osmLineName(tags: Readonly<Record<string, string>>): string {
  const raw = tags.ref ?? tags.line ?? "";
  const ref = raw.split(";")[0]?.trim() ?? "";
  if (OSM_LINE_NAMES[ref]) {
    return OSM_LINE_NAMES[ref];
  }
  if (tags.line && tags.line !== "수도권 전철") {
    const first = tags.line.split(";")[0]?.trim();
    if (first) return first;
  }
  return "지하철";
}

const upstreamSubwayArrivalSchema = z.object({
  errorMessage: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .nullable()
    .optional(),
  realtimeArrivalList: z
    .array(
      z.object({
        subwayId: z.string().min(1),
        updnLine: z.string().min(1),
        trainLineNm: z.string().min(1),
        btrainSttus: z.string().default("일반"),
        barvlDt: z.string().nullable().optional(),
        arvlMsg2: z.string().default(""),
        arvlMsg3: z.string().nullable().optional(),
        lstcarAt: z.string().nullable().optional(),
        recptnDt: z.string().min(1),
      }),
    )
    .default([]),
});

export type UpstreamSubwayArrivalPayload = z.infer<
  typeof upstreamSubwayArrivalSchema
>;

function parseSeoulTimestamp(value: string): string {
  const normalized = value.trim().replace(" ", "T");
  const instant = new Date(`${normalized}+09:00`);
  return Number.isNaN(instant.getTime())
    ? new Date().toISOString()
    : instant.toISOString();
}

export function normalizeSubwayArrivals(
  input: unknown,
): { arrivals: SubwayArrival[]; updatedAt: string } {
  const parsed = upstreamSubwayArrivalSchema.parse(input);
  const arrivals: SubwayArrival[] = parsed.realtimeArrivalList.map(
    (row) => ({
      id: `${row.subwayId}-${row.updnLine}-${row.trainLineNm}`,
      subwayId: row.subwayId,
      updnLine: row.updnLine,
      line: SUBWAY_LINE_NAMES[row.subwayId] ?? "기타",
      direction: row.trainLineNm,
      trainLineNm: row.trainLineNm,
      trainStatus: row.btrainSttus || "일반",
      seconds:
        row.barvlDt !== undefined &&
        row.barvlDt !== null &&
        row.barvlDt !== "" &&
        Number.isFinite(Number(row.barvlDt))
          ? Number(row.barvlDt)
          : null,
      message: row.arvlMsg2,
      location: row.arvlMsg3?.trim() || null,
      isLastTrain: row.lstcarAt === "1",
    }),
  );
  arrivals.sort(
    (left, right) =>
      (left.seconds ?? Number.POSITIVE_INFINITY) -
        (right.seconds ?? Number.POSITIVE_INFINITY) ||
      left.direction.localeCompare(right.direction, "ko"),
  );
  const latest = parsed.realtimeArrivalList.reduce(
    (max, row) => (row.recptnDt > max ? row.recptnDt : max),
    "",
  );
  return { arrivals, updatedAt: parseSeoulTimestamp(latest) };
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

export function normalizeNearbySubwayStations(
  input: unknown,
  center: { readonly lat: number; readonly lng: number },
): SubwayStation[] {
  const parsed = overpassResponseSchema.parse(input);
  const stationsByName = new Map<string, SubwayStation>();

  for (const element of parsed.elements) {
    const lat = element.lat ?? element.center?.lat;
    const lng = element.lon ?? element.center?.lon;
    const name = element.tags["name:ko"] ?? element.tags.name;
    if (lat === undefined || lng === undefined || !name) {
      continue;
    }

    const station: SubwayStation = {
      id: SubwayStationIdSchema.parse(`osm-${element.type}-${element.id}`),
      name,
      line: osmLineName(element.tags),
      lat,
      lng,
      distanceMeters: Math.round(distanceMeters(center, { lat, lng })),
    };
    const current = stationsByName.get(name);
    if (!current || station.distanceMeters < current.distanceMeters) {
      stationsByName.set(name, station);
    }
  }

  return [...stationsByName.values()].sort(
    (left, right) =>
      left.distanceMeters - right.distanceMeters ||
      left.name.localeCompare(right.name, "ko"),
  );
}
