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
      line:
        element.tags.ref ??
        element.tags.line ??
        element.tags.network ??
        "지하철",
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
