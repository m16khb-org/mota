import { z } from "zod";
import {
  type BusArrival,
  type BusStop,
  busStopSchema,
} from "../domain/bus";

const nearbyResultSchema = z.object({
  stops: z.array(busStopSchema),
});

const arrivalsResultSchema = z.object({
  arrivals: z.array(
    z.object({
      routeId: z.string().min(1),
      routeName: z.string().min(1),
      direction: z.string(),
      routeType: z.string(),
      lowFloor: z.boolean(),
      first: z.object({
        message: z.string(),
        seconds: z.number().nullable(),
        remainingStops: z.number().nullable(),
        congestion: z.enum(["여유", "보통", "혼잡", "매우 혼잡"]).nullable(),
      }),
      second: z
        .object({
          message: z.string(),
          seconds: z.number().nullable(),
          remainingStops: z.number().nullable(),
          congestion: z.enum(["여유", "보통", "혼잡", "매우 혼잡"]).nullable(),
        })
        .nullable(),
    }),
  ),
  updatedAt: z.string().datetime(),
});

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }
  return response.json();
}
export async function fetchNearbyStops(
  center: { readonly lat: number; readonly lng: number },
  radius = 800,
): Promise<BusStop[]> {
  const params = new URLSearchParams({
    lat: center.lat.toFixed(6),
    lng: center.lng.toFixed(6),
    radius: String(radius),
  });
  const payload = await getJson(`/api/stops/nearby?${params}`);
  return nearbyResultSchema.parse(payload).stops;
}

export async function fetchArrivals(
  arsId: BusStop["arsId"],
): Promise<{ readonly arrivals: BusArrival[]; readonly updatedAt: string }> {
  const payload = await getJson(`/api/arrivals/${arsId}`);
  return arrivalsResultSchema.parse(payload) as {
    readonly arrivals: BusArrival[];
    readonly updatedAt: string;
  };
}
