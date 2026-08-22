import type { ArsId, BusArrival } from "./bus";
import type { AutoCommuteProcedure, CommuteProcedureId } from "./commute";
import type {
  BusArrivalsSource,
  SubwayArrivalsSource,
} from "./commuteEstimate";
import {
  suggestBusRideMinutes,
  suggestSubwayRideMinutes,
  suggestWalkMinutes,
} from "./commuteTravelTime";
import type { SubwayArrival } from "./subway";

/** Run-time derivation for `kind: "auto"` procedures: the user persists only
 * an ordered itinerary (origin place + saved points); boarding services,
 * waits, and ride times are derived here from point geometry plus live
 * arrivals. Nothing in this module is persisted. */

const MINUTE_MS = 60_000;
/** Default boarding waits when no live departure is catchable. */
const BUS_FALLBACK_WAIT_MINUTES = 5;
const SUBWAY_FALLBACK_WAIT_MINUTES = 4;
const LIVE_WINDOW_MS = 90_000;

/** A saved point resolved against the place by the caller (hook layer). */
export interface ResolvedAutoPoint {
  /** Saved stop or station id. */
  readonly pointId: string;
  readonly kind: "stop" | "station";
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  readonly arsId?: ArsId;
  readonly apiStationName?: string;
}

export type AutoLegBasis = "live" | "estimated" | "stale" | "unavailable";

export interface AutoPlanLeg {
  readonly id: string;
  readonly kind: "bus" | "subway";
  readonly fromName: string;
  readonly toName: string;
  /** Chosen boarding service, e.g. `341 버스 · 강동공영차고지` or
   * `5호선 방화행`; null when no live route identity is available. */
  readonly routeLabel: string | null;
  readonly rideMinutes: number;
  readonly waitSeconds: number;
  readonly basis: AutoLegBasis;
  readonly startAt: number;
  readonly departureAt: number;
  readonly endAt: number;
}

export interface AutoCommutePlan {
  readonly procedureId: CommuteProcedureId;
  /** Walk from the place origin to the first point; null when the origin is
   * unset (the timeline then starts at the first boarding). */
  readonly originWalkMinutes: number | null;
  readonly originMissing: boolean;
  /** The first boarding choice powering leave guidance. */
  readonly board: {
    readonly routeLabel: string;
    readonly waitSeconds: number;
    readonly basis: AutoLegBasis;
  } | null;
  readonly legs: readonly AutoPlanLeg[];
  /** Leave-home time; requires both an origin and a live first departure. */
  readonly leaveBy: number | null;
  readonly arrivalAt: number | null;
}

export interface AutoCommuteEstimateInput {
  readonly procedure: AutoCommuteProcedure;
  readonly points: readonly ResolvedAutoPoint[];
  readonly origin: { readonly lat: number; readonly lng: number } | null;
  readonly now: number;
  readonly busArrivals?: readonly BusArrivalsSource[];
  readonly subwayArrivals?: readonly SubwayArrivalsSource[];
}

interface BusCandidate {
  readonly departureAt: number;
  readonly label: string;
  readonly towardsTarget: boolean;
}

function sourceBasis(
  source: BusArrivalsSource | SubwayArrivalsSource | undefined,
  now: number,
): AutoLegBasis {
  if (
    source === undefined ||
    source.arrivals === null ||
    source.successAt === null
  ) {
    return "unavailable";
  }
  if (source.latestAttemptFailed || now - source.successAt > LIVE_WINDOW_MS) {
    return "stale";
  }
  return "live";
}

/** Match a service destination label against the next point's name: bus
 * directions are terminus names (`강동공영차고지`), so a stop/station on the
 * way is a substring hit after stripping common suffixes. */
function serviceGoesTowards(label: string, targetName: string): boolean {
  const normalize = (value: string) =>
    value
      .normalize("NFC")
      .replace(/정류장|역|\s+/g, "")
      .toLowerCase();
  const labelCore = normalize(label);
  const targetCore = normalize(targetName);
  if (labelCore.length < 2 || targetCore.length < 2) {
    return false;
  }
  return labelCore.includes(targetCore) || targetCore.includes(labelCore);
}

function busCandidates(
  arrivals: readonly BusArrival[],
  successAt: number,
  targetName: string,
): BusCandidate[] {
  const candidates: BusCandidate[] = [];
  for (const arrival of arrivals) {
    if (arrival.first.seconds === null) {
      continue;
    }
    const label = `${arrival.routeName} 버스 · ${arrival.direction}`;
    candidates.push({
      departureAt: successAt + arrival.first.seconds * 1000,
      label,
      towardsTarget: serviceGoesTowards(arrival.direction, targetName),
    });
  }
  return candidates;
}

function subwayCandidates(
  arrivals: readonly SubwayArrival[],
  successAt: number,
  targetName: string,
): BusCandidate[] {
  const candidates: BusCandidate[] = [];
  for (const arrival of arrivals) {
    if (arrival.seconds === null) {
      continue;
    }
    const label = `${arrival.line} ${arrival.trainLineNm}`;
    candidates.push({
      departureAt: successAt + arrival.seconds * 1000,
      label,
      towardsTarget: serviceGoesTowards(
        `${arrival.trainLineNm} ${arrival.direction}`,
        targetName,
      ),
    });
  }
  return candidates;
}

/** Routes actually heading to the next point win; among equals the earliest
 * catchable departure, then the label, decides — independent of response
 * order. */
function chooseBusCandidate(
  candidates: readonly BusCandidate[],
  readiness: number,
): BusCandidate | null {
  let chosen: BusCandidate | null = null;
  for (const candidate of candidates) {
    if (candidate.departureAt < readiness) {
      continue;
    }
    const better =
      chosen === null ||
      (candidate.towardsTarget && !chosen.towardsTarget) ||
      (candidate.towardsTarget === chosen.towardsTarget &&
        (candidate.departureAt < chosen.departureAt ||
          (candidate.departureAt === chosen.departureAt &&
            candidate.label < chosen.label)));
    if (better) {
      chosen = candidate;
    }
  }
  return chosen;
}

export function deriveAutoCommutePlan(
  input: AutoCommuteEstimateInput,
): AutoCommutePlan | null {
  const { procedure, points, origin, now } = input;
  if (points.length === 0 || procedure.points.length === 0) {
    return null;
  }
  const busSources = input.busArrivals ?? [];
  const subwaySources = input.subwayArrivals ?? [];

  let cursor = now;
  let originWalkMinutes: number | null = null;
  if (origin !== null && points[0] !== undefined) {
    const walk = suggestWalkMinutes(origin, points[0]);
    originWalkMinutes = walk ?? 0;
    cursor += originWalkMinutes * MINUTE_MS;
  }
  const originMissing = origin === null;

  const legs: AutoPlanLeg[] = [];
  let leaveBy: number | null = null;
  let board: AutoCommutePlan["board"] = null;

  for (let index = 0; index + 1 < points.length; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    if (from === undefined || to === undefined) {
      continue;
    }
    const kind: "bus" | "subway" = from.kind === "stop" ? "bus" : "subway";
    const rideMinutes =
      (kind === "bus"
        ? suggestBusRideMinutes(from, to)
        : suggestSubwayRideMinutes(from, to)) ?? 0;

    const source =
      kind === "bus"
        ? busSources.find((candidate) => candidate.stopId === from.pointId)
        : subwaySources.find(
            (candidate) => candidate.stationId === from.pointId,
          );
    const basis = sourceBasis(source, now);
    const fallbackWaitMinutes =
      kind === "bus"
        ? BUS_FALLBACK_WAIT_MINUTES
        : SUBWAY_FALLBACK_WAIT_MINUTES;

    let routeLabel: string | null = null;
    let waitSeconds = fallbackWaitMinutes * 60;
    let waitBasis: AutoLegBasis =
      basis === "unavailable" ? "unavailable" : basis;
    let departureAt = cursor + waitSeconds * 1000;

    if (
      basis === "live" &&
      source !== undefined &&
      source.arrivals !== null &&
      source.successAt !== null
    ) {
      const candidates =
        kind === "bus"
          ? busCandidates(source.arrivals as readonly BusArrival[], source.successAt, to.name)
          : subwayCandidates(
              source.arrivals as readonly SubwayArrival[],
              source.successAt,
              to.name,
            );
      const chosen = chooseBusCandidate(candidates, cursor);
      if (chosen !== null) {
        routeLabel = chosen.label;
        waitSeconds = Math.round((chosen.departureAt - cursor) / 1000);
        waitBasis = "live";
        departureAt = chosen.departureAt;
      }
    }

    if (basis !== "live" && routeLabel === null) {
      // No catchable live departure: keep the honest fallback wait and mark
      // the basis so the UI can say 예상/오래됨 instead of 실시간.
      waitBasis = basis === "stale" ? "stale" : "estimated";
    }

    const endAt = departureAt + rideMinutes * MINUTE_MS;
    legs.push({
      id: `${procedure.id}:leg:${index}`,
      kind,
      fromName: from.name,
      toName: to.name,
      routeLabel,
      rideMinutes,
      waitSeconds,
      basis: waitBasis,
      startAt: cursor,
      departureAt,
      endAt,
    });

    if (index === 0 && routeLabel !== null && waitBasis === "live") {
      board = { routeLabel, waitSeconds, basis: waitBasis };
      if (!originMissing && originWalkMinutes !== null) {
        leaveBy = departureAt - originWalkMinutes * MINUTE_MS;
      }
    }
    cursor = endAt;
  }

  return {
    procedureId: procedure.id,
    originWalkMinutes,
    originMissing,
    board,
    legs,
    leaveBy,
    arrivalAt: legs.length > 0 ? cursor : null,
  };
}
