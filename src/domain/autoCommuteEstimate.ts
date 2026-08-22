import type { ArsId, BusArrival, BusRouteStation, RouteId } from "./bus";
import {
  terminusMatches,
  verifyRouteLeg,
  type RouteLegVerification,
} from "./routeVerification";
import { verifySubwayLeg } from "./subwayLine";
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
  /** The chosen bus was verified against the route's own stop list: it
   * really stops near the next waypoint, and rideMinutes is the true path
   * length over that list. */
  readonly verified: boolean;
  /** Verified legs only: the actual alighting stop name. */
  readonly alightName: string | null;
  /** Verified legs only: alighting stop → waypoint walk, whole minutes. */
  readonly tailWalkMinutes: number;
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
  /** Route stop lists by routeId (fetched by the hook layer through the
   * route-stations port). Present entries enable waypoint verification and
   * path-accurate ride times; missing entries fall back to geometry. */
  readonly routeStations?: ReadonlyMap<string, readonly BusRouteStation[]>;
}

interface BusCandidate {
  readonly departureAt: number;
  readonly label: string;
  readonly towardsTarget: boolean;
  /** Waypoint verification succeeded AND the live direction matches the
   * required terminus — the route provably serves this leg the right way. */
  readonly verified: RouteLegVerification | null;
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

/** A live bus departure observed at the boarding stop, with the identity
 * needed for route verification. */
interface BusServiceCandidate {
  readonly routeId: RouteId;
  readonly routeName: string;
  readonly direction: string;
  readonly departureAt: number;
}

function busServiceCandidates(
  arrivals: readonly BusArrival[],
  successAt: number,
): BusServiceCandidate[] {
  const candidates: BusServiceCandidate[] = [];
  for (const arrival of arrivals) {
    if (arrival.first.seconds === null) {
      continue;
    }
    candidates.push({
      routeId: arrival.routeId,
      routeName: arrival.routeName,
      direction: arrival.direction,
      departureAt: successAt + arrival.first.seconds * 1000,
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
      verified: null,
    });
  }
  return candidates;
}

/** Verified correct-way routes win; among equals the earliest catchable
 * departure, then the label, decides — independent of response order. */
function chooseBusCandidate(
  candidates: readonly BusCandidate[],
  readiness: number,
): BusCandidate | null {
  const rank = (candidate: BusCandidate): number =>
    candidate.verified !== null ? 2 : candidate.towardsTarget ? 1 : 0;
  let chosen: BusCandidate | null = null;
  for (const candidate of candidates) {
    if (candidate.departureAt < readiness) {
      continue;
    }
    const better =
      chosen === null ||
      rank(candidate) > rank(chosen) ||
      (rank(candidate) === rank(chosen) &&
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

    // Waypoint verification (bus legs) happens inside the live-candidate
    // selection below: the route's own stop list proves the bus stops near
    // `to`, yields the true path ride time, the actual alighting stop, and
    // the required terminus for a correct-way bus.

    let rideMinutes =
      (kind === "bus"
        ? suggestBusRideMinutes(from, to)
        : suggestSubwayRideMinutes(from, to)) ?? 0;

    let routeLabel: string | null = null;
    let waitSeconds = fallbackWaitMinutes * 60;
    let waitBasis: AutoLegBasis =
      basis === "unavailable" ? "unavailable" : basis;
    let departureAt = cursor + waitSeconds * 1000;
    let alightName: string | null = null;
    let tailWalkMinutes = 0;

    if (
      basis === "live" &&
      source !== undefined &&
      source.arrivals !== null &&
      source.successAt !== null
    ) {
      if (kind === "bus" && from.arsId !== undefined) {
        const services = busServiceCandidates(
          source.arrivals as readonly BusArrival[],
          source.successAt,
        );
        const routeLists = input.routeStations;
        const candidates: BusCandidate[] = services.map((service) => {
          const leg =
            routeLists === undefined
              ? null
              : (() => {
                  const stations = routeLists.get(service.routeId);
                  if (stations === undefined) {
                    return null;
                  }
                  const checked = verifyRouteLeg({
                    stations,
                    fromArsId: from.arsId ?? ("" as ArsId),
                    to,
                  });
                  return checked !== null &&
                    terminusMatches(service.direction, checked.boundTermini)
                    ? checked
                    : null;
                })();
          return {
            departureAt: service.departureAt,
            label: `${service.routeName} 버스 · ${service.direction}`,
            towardsTarget: serviceGoesTowards(service.direction, to.name),
            verified: leg,
          };
        });
        const chosen = chooseBusCandidate(candidates, cursor);
        if (chosen !== null) {
          routeLabel = chosen.label;
          waitSeconds = Math.round((chosen.departureAt - cursor) / 1000);
          waitBasis = "live";
          departureAt = chosen.departureAt;
          if (chosen.verified !== null) {
            rideMinutes = chosen.verified.pathMinutes;
            alightName = chosen.verified.alightName;
            tailWalkMinutes = chosen.verified.tailWalkMinutes;
          }
        }
      } else {
        const candidates: BusCandidate[] = subwayCandidates(
          source.arrivals as readonly SubwayArrival[],
          source.successAt,
          to.name,
        ).map((candidate) => {
          // Subway verification from the live direction label: the train
          // provably passes the waypoint when its terminus or via name
          // matches the waypoint. Verified trains outrank name-only matches.
          const verified =
            from.kind === "station" && to.kind === "station"
              ? verifySubwayLeg({
                  boardName: from.name,
                  board: from,
                  alightName: to.name,
                  alight: to,
                  directionLabel: candidate.label,
                })
              : null;
          return {
            ...candidate,
            verified:
              verified === null
                ? null
                : {
                    alightName: verified.alightName,
                    tailWalkMinutes: 0,
                    pathMeters: verified.pathMeters,
                    pathMinutes: verified.pathMinutes,
                    boundTermini: [],
                  },
          };
        });
        const chosen = chooseBusCandidate(candidates, cursor);
        if (chosen !== null) {
          routeLabel = chosen.label;
          waitSeconds = Math.round((chosen.departureAt - cursor) / 1000);
          waitBasis = "live";
          departureAt = chosen.departureAt;
          if (chosen.verified !== null) {
            rideMinutes = chosen.verified.pathMinutes;
            alightName = chosen.verified.alightName;
            tailWalkMinutes = chosen.verified.tailWalkMinutes;
          }
        }
      }
    }

    if (basis !== "live" && routeLabel === null) {
      // No catchable live departure: keep the honest fallback wait and mark
      // the basis so the UI can say 예상/오래됨 instead of 실시간.
      waitBasis = basis === "stale" ? "stale" : "estimated";
    }

    const endAt =
      departureAt + (rideMinutes + tailWalkMinutes) * MINUTE_MS;
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
      verified: alightName !== null,
      alightName,
      tailWalkMinutes,
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
