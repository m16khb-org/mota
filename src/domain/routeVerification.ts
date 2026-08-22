import type { ArsId, BusRouteStation } from "./bus";
import { haversineMeters, suggestWalkMinutes } from "./commuteTravelTime";

/** Pure waypoint verification: does this bus route actually pass the next
 * itinerary point, in which direction, and how long is the real ride?
 *
 * This is the accuracy core of the product: instead of trusting a direction
 * label or a straight-line estimate, the route's own ordered stop list is
 * walked from the boarding stop to the stop nearest the waypoint, giving the
 * true path length and an honest alighting stop. */

/** Waypoint match radius: the route must stop within this distance of the
 * next itinerary point to count as passing it. */
export const WAYPOINT_MATCH_METERS = 400;
/** Seoul bus commercial speed incl. stops ≈ 18 km/h. */
const PATH_METERS_PER_MINUTE = 300;

export interface RouteLegVerification {
  /** Stop on the route nearest the waypoint (the alighting stop). */
  readonly alightName: string;
  /** Alighting stop → waypoint walking tail, whole minutes. */
  readonly tailWalkMinutes: number;
  /** True path length along the route's own stops, meters. */
  readonly pathMeters: number;
  readonly pathMinutes: number;
  /** Termini a correct-way bus may be bound for (matched against the
   * live arrival's direction by `terminusMatches`): BIS lists may cover a
   * full round trip, so forward travel can be headed for the stated
   * direction terminus OR the list's final stop. */
  readonly boundTermini: readonly string[];
}

export interface VerifyRouteLegInput {
  readonly stations: readonly BusRouteStation[];
  /** Boarding stop identity. */
  readonly fromArsId: ArsId;
  /** Next itinerary point. */
  readonly to: { readonly lat: number; readonly lng: number };
}

/** Normalizes terminus/direction labels for contains-matching: BIS terminus
 * names carry 정류장/역 suffixes and spacing variants across endpoints. */
function terminusCore(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\s+/g, "")
    .replace(/정류장|정류소|역$/g, "")
    .toLowerCase();
}

/** True when a live arrival's direction label plausibly names any of the
 * termini the verification requires. */
export function terminusMatches(
  candidateDirection: string,
  boundTermini: readonly string[],
): boolean {
  return boundTermini.some((bound) => {
    const candidate = terminusCore(candidateDirection);
    const target = terminusCore(bound);
    if (candidate.length < 2 || target.length < 2) {
      return false;
    }
    return candidate.includes(target) || target.includes(candidate);
  });
}

/** Sums consecutive stop-to-stop distances over the route's own ordering —
 * the ride length a passenger actually experiences. */
function pathMetersBetween(
  stations: readonly BusRouteStation[],
  fromIndex: number,
  toIndex: number,
): number {
  const [start, end] =
    fromIndex <= toIndex ? [fromIndex, toIndex] : [toIndex, fromIndex];
  let meters = 0;
  for (let index = start; index < end; index += 1) {
    const a = stations[index];
    const b = stations[index + 1];
    if (a === undefined || b === undefined) {
      continue;
    }
    meters += haversineMeters(a, b);
  }
  return meters;
}

export function verifyRouteLeg(
  input: VerifyRouteLegInput,
): RouteLegVerification | null {
  const { stations, fromArsId, to } = input;
  if (stations.length === 0) {
    return null;
  }

  // Alighting candidate: the route stop nearest the waypoint.
  let alightIndex = -1;
  let alightDistance = Number.POSITIVE_INFINITY;
  for (const [index, station] of stations.entries()) {
    const distance = haversineMeters(station, to);
    if (distance < alightDistance) {
      alightDistance = distance;
      alightIndex = index;
    }
  }
  const alight = alightIndex >= 0 ? stations[alightIndex] : undefined;
  if (alight === undefined || alightDistance > WAYPOINT_MATCH_METERS) {
    return null;
  }

  // Travel order: find a boarding occurrence whose alight comes after it
  // (forward over the list); fall back to the reversed ordering.
  const boardIndexes = stations
    .map((station, index) => (station.arsId === fromArsId ? index : -1))
    .filter((index) => index >= 0);
  if (boardIndexes.length === 0) {
    return null;
  }
  let forward = true;
  let boardIndex = boardIndexes[0] ?? -1;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const candidate of boardIndexes) {
    const gapForward = alightIndex - candidate;
    if (gapForward > 0 && gapForward < bestGap) {
      bestGap = gapForward;
      boardIndex = candidate;
      forward = true;
    }
    const gapReverse = candidate - alightIndex;
    if (gapReverse > 0 && gapReverse < bestGap) {
      bestGap = gapReverse;
      boardIndex = candidate;
      forward = false;
    }
  }
  if (!Number.isFinite(bestGap)) {
    return null;
  }

  const pathMeters = pathMetersBetween(stations, boardIndex, alightIndex);
  const pathMinutes = Math.max(1, Math.ceil(pathMeters / PATH_METERS_PER_MINUTE));
  const tailWalkMinutes = suggestWalkMinutes(alight, to) ?? 0;
  const listTerminus = stations[0]?.direction ?? "";
  const firstStationName = stations[0]?.name ?? "";
  const lastStationName = stations[stations.length - 1]?.name ?? "";
  return {
    alightName: alight.name,
    tailWalkMinutes,
    pathMeters: Math.round(pathMeters),
    pathMinutes,
    // Forward travel follows this list's ordering. Round-trip lists can be
    // bound for the stated direction terminus OR the final stop (the depot
    // on the return leg); reversed travel is bound for the first stop.
    boundTermini: forward
      ? [listTerminus, lastStationName].filter((name) => name !== "")
      : [firstStationName],
  };
}
