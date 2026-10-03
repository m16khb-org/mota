import { z } from "zod";
import {
  transitSettingsSnapshotSchema,
  type TransitSettingsSnapshot,
  type TransitSettingsUpdate,
} from "@mota/contracts/transit-settings";
import { type BusArrival, type BusStop, busStopSchema } from "../domain/bus";
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

const isoDateTimeSchema = z.string().datetime();

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly retryAt: string | null;

  constructor(status: number, code: string | null, retryAt: string | null = null) {
    super(`Request failed with ${status}${code ? `: ${code}` : ""}`);
    this.status = status;
    this.code = code;
    this.retryAt = retryAt;
  }
}

export function isServiceAreaError(error: unknown): boolean {
  return error instanceof ApiError && error.code === "INVALID_LOCATION";
}

function parseApiErrorPayload(payload: unknown): {
  readonly code: string | null;
  readonly retryAt: string | null;
} {
  const record =
    typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : null;
  const code = typeof record?.error === "string" ? record.error : null;
  const retryAtCandidate = record?.retryAt;
  const retryAt =
    typeof retryAtCandidate === "string" && isoDateTimeSchema.safeParse(retryAtCandidate).success
      ? retryAtCandidate
      : null;
  return { code, retryAt };
}

async function readApiErrorPayload(response: Response) {
  return response
    .json()
    .then(parseApiErrorPayload)
    .catch(() => ({ code: null, retryAt: null }));
}

async function getJson(
  url: string,
  timeoutMs = 8_000,
  callerSignal?: AbortSignal,
): Promise<unknown> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = callerSignal ? AbortSignal.any([callerSignal, timeoutSignal]) : timeoutSignal;
  const response = await fetch(url, { signal });
  if (!response.ok) {
    const { code, retryAt } = await readApiErrorPayload(response);
    throw new ApiError(response.status, code, retryAt);
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
    const { code, retryAt } = await readApiErrorPayload(response);
    throw new ApiError(response.status, code, retryAt);
  }
  return response.json();
}
export async function fetchNearbyStops(
  center: { readonly lat: number; readonly lng: number },
  radius = 800,
  signal?: AbortSignal,
): Promise<BusStop[]> {
  const params = new URLSearchParams({
    lat: center.lat.toFixed(6),
    lng: center.lng.toFixed(6),
    radius: String(radius),
  });
  const payload = await getJson(`/api/stops/nearby?${params}`, 8_000, signal);
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
