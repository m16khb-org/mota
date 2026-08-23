import { z } from "zod";
import {
  transitSettingsSnapshotSchema,
  type TransitSettingsSnapshot,
  type TransitSettingsUpdate,
} from "@mota/contracts/transit-settings";
import {
  type BusArrival,
  type BusStop,
  busStopSchema,
} from "../domain/bus";
import {
  type SubwayArrival,
  type SubwayStation,
  subwayArrivalSchema,
  subwayStationSchema,
} from "../domain/subway";

const nearbyResultSchema = z.object({
  stops: z.array(busStopSchema),
});

const nearbySubwayResultSchema = z.object({
  stations: z.array(subwayStationSchema),
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

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, code: string | null) {
    super(`Request failed with ${status}${code ? `: ${code}` : ""}`);
    this.status = status;
    this.code = code;
  }
}

export function isServiceAreaError(error: unknown): boolean {
  return error instanceof ApiError && error.code === "INVALID_LOCATION";
}

const subwayArrivalsResultSchema = z.object({
  arrivals: z.array(subwayArrivalSchema),
  updatedAt: z.string().datetime(),
});

async function getJson(url: string, timeoutMs = 8_000): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    const code = await response
      .json()
      .then((payload) => {
        const parsed = payload as { error?: unknown };
        return typeof parsed.error === "string" ? parsed.error : null;
      })
      .catch(() => null);
    throw new ApiError(response.status, code);
  }
  return response.json();
}

async function putJson(url: string, body: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    const code = await response
      .json()
      .then((payload) => {
        const parsed = payload as { error?: unknown };
        return typeof parsed.error === "string" ? parsed.error : null;
      })
      .catch(() => null);
    throw new ApiError(response.status, code);
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

export async function fetchNearbySubwayStations(
  center: { readonly lat: number; readonly lng: number },
  radius = 3_000,
): Promise<SubwayStation[]> {
  const params = new URLSearchParams({
    lat: center.lat.toFixed(6),
    lng: center.lng.toFixed(6),
    radius: String(radius),
  });
  const payload = await getJson(`/api/subway/nearby?${params}`, 35_000);
  return nearbySubwayResultSchema.parse(payload).stations;
}

export async function fetchSubwayArrivals(
  station: SubwayStation["name"],
): Promise<{ readonly arrivals: readonly SubwayArrival[]; readonly updatedAt: string }> {
  const params = new URLSearchParams({ station });
  const payload = await getJson(`/api/subway/arrivals?${params}`);
  return subwayArrivalsResultSchema.parse(payload) as {
    readonly arrivals: readonly SubwayArrival[];
    readonly updatedAt: string;
  };
}

export async function fetchTransitSettings(): Promise<TransitSettingsSnapshot> {
  const payload = await getJson("/api/settings");
  return transitSettingsSnapshotSchema.parse(payload);
}

export async function saveTransitSettings(
  update: TransitSettingsUpdate,
): Promise<TransitSettingsSnapshot> {
  const payload = await putJson("/api/settings", update);
  return transitSettingsSnapshotSchema.parse(payload);
}
