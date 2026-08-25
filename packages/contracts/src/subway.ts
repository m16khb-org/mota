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

/** Major Seoul subway stations → serving line (first-listed). OSM nodes
 * for Seoul lack line tags, so name lookup fills the gap for display. */
const STATION_NAME_LINES: Readonly<Record<string, string>> = {
  "서울역": "1호선", "시청": "2호선", "종각": "1호선", "종로3가": "3호선",
  "종로5가": "1호선", "동대문": "4호선", "신설동": "1호선", "제기동": "1호선",
  "청량리": "경의중앙선", "회기": "경춘선", "외대앞": "1호선", "신이문": "1호선",
  "을지로입구": "2호선", "을지로3가": "3호선", "을지로4가": "5호선",
  "동대문역사문화공원": "2호선", "신당": "6호선", "왕십리": "경의중앙선",
  "한양대": "2호선", "뚝섬": "2호선", "성수": "2호선", "건대입구": "7호선",
  "구의": "2호선", "강변": "2호선", "잠실나루": "2호선", "잠실": "8호선",
  "잠실새내": "2호선", "종합운동장": "9호선", "삼성": "2호선", "선릉": "수인분당선",
  "역삼": "2호선", "강남": "2호선", "교대": "3호선", "서초": "2호선",
  "방배": "2호선", "사당": "4호선", "낙성대": "2호선", "서울대입구": "2호선",
  "봉천": "2호선", "신림": "2호선", "신대방": "2호선", "구로디지털단지": "2호선",
  "대림": "7호선", "신도림": "2호선", "문래": "2호선", "영등포구청": "5호선",
  "당산": "2호선", "합정": "6호선", "홍대입구": "공항철도", "신촌": "경의중앙선",
  "이대": "2호선", "아현": "2호선", "충정로": "5호선",
  "경복궁": "3호선", "안국": "3호선", "약수": "6호선", "금호": "3호선",
  "옥수": "경의중앙선", "압구정": "3호선", "신사": "신분당선", "잠원": "3호선",
  "고속터미널": "9호선", "남부터미널": "3호선", "양재": "신분당선", "매봉": "3호선",
  "도곡": "3호선", "대치": "3호선", "학여울": "3호선", "대청": "3호선",
  "일원": "3호선", "수서": "3호선", "가락시장": "8호선", "경찰병원": "3호선",
  "오금": "3호선",
  "혜화": "4호선", "명동": "4호선", "회현": "4호선", "숙대입구": "4호선",
  "삼각지": "6호선", "신용산": "4호선", "이촌": "경의중앙선", "동작": "9호선",
  "총신대입구": "4호선", "남태령": "4호선",
  "김포공항": "9호선", "방화": "5호선", "개화산": "5호선", "화곡": "5호선",
  "우장산": "5호선", "발산": "5호선", "마곡": "5호선", "송정": "5호선",
  "까치산": "5호선", "신정": "5호선", "목동": "5호선", "오목교": "5호선",
  "양평": "5호선", "영등포시장": "5호선", "신길": "5호선", "여의도": "9호선",
  "여의나루": "5호선", "마포": "5호선", "공덕": "6호선", "애오개": "5호선",
  "서대문": "5호선", "광화문": "5호선", "청구": "5호선", "신금호": "5호선",
  "호수공원": "5호선", "군자": "7호선", "아차산": "5호선", "광나루": "5호선",
  "천호": "8호선", "강동": "5호선", "길동": "5호선", "굽은다리": "5호선",
  "명일": "5호선", "고덕": "5호선", "상일동": "5호선", "강일": "5호선",
  "미사": "5호선", "하남풍산": "5호선",
  "응암": "6호선", "역촌": "6호선", "불광": "6호선", "독바위": "6호선",
  "연신내": "6호선", "구산": "6호선", "새절": "9호선", "증산": "9호선",
  "디지털미디어시티": "공항철도", "월드컵경기장": "6호선", "마포구청": "6호선",
  "망원": "6호선", "상수": "6호선", "광흥창": "6호선", "대흥": "6호선",
  "효창공원앞": "경의중앙선", "한강진": "6호선", "이태원": "6호선",
  "녹사평": "6호선", "한남": "경의중앙선", "동묘앞": "6호선", "창신": "6호선",
  "보문": "6호선", "안암": "6호선", "고려대": "6호선", "월곡": "6호선",
  "상월곡": "6호선", "돌곶이": "6호선", "석관": "6호선", "태릉입구": "7호선",
  "화랑대": "6호선", "봉화산": "6호선", "신내": "경춘선",
  "장암": "7호선", "도봉산": "7호선", "수락산": "7호선", "마들": "7호선",
  "노원": "7호선", "중계": "7호선", "하계": "7호선", "공릉": "7호선",
  "먹골": "7호선", "중화": "7호선", "상봉": "경의중앙선", "면목": "7호선",
  "사가정": "7호선", "용마산": "7호선", "중곡": "7호선", "어린이대공원": "7호선",
  "뚝섬유원지": "7호선", "청담": "7호선", "강남구청": "수인분당선",
  "학동": "7호선", "논현": "신분당선", "반포": "7호선", "내방": "7호선",
  "이수": "7호선", "남성": "7호선", "숭실대입구": "7호선", "상도": "7호선",
  "장승배기": "7호선", "신대방삼거리": "7호선", "보라매공원": "7호선",
  "신풍": "7호선", "남구로": "7호선", "철산": "7호선", "광명사거리": "7호선",
  "천왕": "7호선", "온수": "7호선", "까치울": "7호선", "석남": "7호선",
  "암사": "8호선", "강동구청": "8호선", "모진": "8호선", "석촌": "9호선",
  "송파": "8호선", "문정": "8호선", "장지": "8호선", "복정": "8호선",
  "산성": "8호선", "남한산성입구": "8호선", "단대오거리": "8호선",
  "신흥": "8호선", "수진": "8호선", "모란": "8호선",
  "개화": "9호선", "공항시장": "9호선", "신방화": "9호선", "마곡나루": "9호선",
  "양천향교": "9호선", "가양": "9호선", "증미": "9호선", "등촌": "9호선",
  "염창": "9호선", "금화": "9호선", "국제금융센터": "9호선", "샛강": "9호선",
  "노량진": "9호선", "흑석": "9호선", "구반포": "9호선", "신반포": "9호선",
  "사평": "9호선", "신논현": "9호선", "언주": "9호선", "선정릉": "수인분당선",
  "삼성중앙": "9호선", "봉은사": "9호선", "삼전": "9호선", "석촌고분": "9호선",
  "송파나루": "9호선", "한성백제": "9호선", "올림픽공원": "9호선",
  "둔촌오룡": "9호선", "중앙보훈병원": "9호선",
  "둔촌동": "9호선", "몽촌토성": "8호선", "둔촌오륜": "9호선",
  "동남산": "8호선", "부개": "1호선", "소새울": "7호선", "부천": "1호선",
  "용산": "경의중앙선", "서빙고": "경의중앙선", "응봉": "경의중앙선",
  "중랑": "경춘선", "망우": "경춘선", "갈매": "경춘선", "별내": "경춘선",
  "퇴계원": "경춘선", "사릉": "경춘선", "금곡": "경춘선", "평내호평": "경춘선",
  "천마산": "경춘선", "마석": "경춘선", "대성리": "경춘선", "상천": "경춘선",
  "청평": "경춘선", "상색": "경춘선", "가평": "경춘선", "굴봉산": "경춘선",
  "백양리": "경춘선", "강촌": "경춘선", "김유정": "경춘선", "남춘천": "경춘선",
  "서울숲": "수인분당선", "압구정로데오": "수인분당선", "한티": "수인분당선",
  "양재시민의숲": "신분당선", "계양": "공항철도",
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
  // Seoul station-code refs: 2xx→2호선, 3xx→3호선, … 9xx→9호선
  if (/^[1-9]\d{2}$/.test(ref)) {
    return `${ref[0] ?? ""}호선`;
  }
  // K-prefixed codes: K2xx→경의중앙선 등
  if (ref.startsWith("K")) {
    const kNum = ref.slice(1);
    if (kNum.startsWith("2")) return "경의중앙선";
    if (kNum.startsWith("4")) return "경춘선";
    if (kNum.startsWith("9")) return "경강선";
    if (kNum.startsWith("8")) return "서해선";
  }
  return STATION_NAME_LINES[tags.name ?? ""] ?? "지하철";
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
    (row) => {
      const parsedSeconds = Number(row.barvlDt);
      const hasNumericEta =
        row.barvlDt !== undefined &&
        row.barvlDt !== null &&
        row.barvlDt !== "" &&
        Number.isFinite(parsedSeconds);
      const hasUnavailablePosition =
        parsedSeconds === 0 && /^\[\d+\]번째 전역/.test(row.arvlMsg2);
      const seconds =
        hasNumericEta && !hasUnavailablePosition
          ? parsedSeconds
          : null;
      return {
        id: `${row.subwayId}-${row.updnLine}-${row.trainLineNm}`,
        subwayId: row.subwayId,
        updnLine: row.updnLine,
        line: SUBWAY_LINE_NAMES[row.subwayId] ?? "기타",
        direction: row.trainLineNm,
        trainLineNm: row.trainLineNm,
        trainStatus: row.btrainSttus || "일반",
        seconds,
        message: row.arvlMsg2,
        location: row.arvlMsg3?.trim() || null,
        isLastTrain: row.lstcarAt === "1",
      };
    },
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

/** Resolve the display line name for a saved station whose persisted `line`
 * predates the OSM line mapping (e.g. stored as "수도권 전철" or a ref code). */
export function stationDisplayLine(station: SubwayStation): string {
  if (
    station.line !== "지하철" &&
    station.line !== "수도권 전철" &&
    !/^\d+$/.test(station.line)
  ) {
    return station.line;
  }
  const mapped = STATION_NAME_LINES[station.name];
  return mapped ?? (station.line === "수도권 전철" ? "지하철" : station.line);
}
