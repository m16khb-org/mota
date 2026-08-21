import type { BusArrival, RouteId, StopId } from "./bus";
import type { CommuteProcedureId, CommuteStepId } from "./commute";
import type { SubwayArrival, SubwayStation } from "./subway";

/** A retained successful snapshot stays live for at most 90 seconds. */
const LIVE_WINDOW_MS = 90_000;
const MINUTE_MS = 60_000;

export type CommuteStepEstimateBasis =
  | "live"
  | "estimated"
  | "stale"
  | "unavailable";

type SnapshotBasis = "live" | "stale" | "unavailable";

/** Retained arrivals for one saved bus stop. `arrivals === null` means the
 * source never succeeded; a failed latest attempt keeps the retained success
 * stale instead of live. Countdowns are relative to `successAt`. */
export interface BusArrivalsSource {
  readonly stopId: StopId;
  readonly arrivals: readonly BusArrival[] | null;
  readonly successAt: number | null;
  readonly latestAttemptFailed: boolean;
}

/** Retained arrivals for one saved subway station, same freshness rules. */
export interface SubwayArrivalsSource {
  readonly stationId: SubwayStation["id"];
  readonly arrivals: readonly SubwayArrival[] | null;
  readonly successAt: number | null;
  readonly latestAttemptFailed: boolean;
}

export interface WalkEstimateStep {
  readonly id: CommuteStepId;
  readonly kind: "walk";
  readonly minutes: number;
}

export interface BusEstimateStep {
  readonly id: CommuteStepId;
  readonly kind: "bus";
  readonly stopId: StopId;
  readonly routeId: RouteId;
  readonly direction: string;
  readonly rideMinutes: number;
  readonly fallbackWaitMinutes?: number;
}

export interface SubwayEstimateStep {
  readonly id: CommuteStepId;
  readonly kind: "subway";
  readonly stationId: SubwayStation["id"];
  readonly subwayId: string;
  readonly updnLine: string;
  readonly rideMinutes: number;
  readonly fallbackWaitMinutes?: number;
}

export type CommuteEstimateStep =
  | WalkEstimateStep
  | BusEstimateStep
  | SubwayEstimateStep;

/** A schema-parsed ready procedure from `./commute` is directly assignable. */
export interface CommuteEstimateProcedure {
  readonly id: CommuteProcedureId;
  readonly steps: readonly CommuteEstimateStep[];
}

export interface CommuteEstimateInput {
  readonly procedure: CommuteEstimateProcedure;
  readonly now: number;
  readonly busArrivals?: readonly BusArrivalsSource[];
  readonly subwayArrivals?: readonly SubwayArrivalsSource[];
}

export interface CommuteStepEstimate {
  readonly stepId: CommuteStepId;
  readonly basis: CommuteStepEstimateBasis;
  readonly startAt: number | null;
  readonly waitSeconds: number | null;
  readonly departureAt: number | null;
  readonly endAt: number | null;
  readonly matchedCandidate: string | null;
}

export interface CommuteEstimate {
  readonly procedureId: CommuteProcedureId;
  readonly arrivalAt: number | null;
  readonly leaveBy: number | null;
  readonly blockedAtStepId: CommuteStepId | null;
  readonly steps: readonly CommuteStepEstimate[];
}

interface DepartureCandidate {
  readonly departureAt: number;
  readonly candidate: string;
}

interface TransitOutcome {
  readonly estimate: CommuteStepEstimate;
  readonly nextCursor: number;
  readonly blocked: boolean;
}

/** Bus directions are exact strings; only NFC and whitespace variations are
 * normalized so a padded upstream label still matches the saved identity. */
function normalizeServiceText(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ");
}

function snapshotBasis(
  source: BusArrivalsSource | SubwayArrivalsSource | undefined,
  now: number,
): SnapshotBasis {
  if (source === undefined || source.arrivals === null || source.successAt === null) {
    return "unavailable";
  }
  if (source.latestAttemptFailed || now - source.successAt > LIVE_WINDOW_MS) {
    return "stale";
  }
  return "live";
}

/** Earliest matching departure at or after readiness. Countdowns that already
 * passed readiness are never reused; the label tie-break keeps the choice
 * independent of response order. */
function chooseDeparture(
  candidates: readonly DepartureCandidate[],
  readiness: number,
): DepartureCandidate | null {
  let chosen: DepartureCandidate | null = null;
  for (const candidate of candidates) {
    if (candidate.departureAt < readiness) {
      continue;
    }
    if (
      chosen === null ||
      candidate.departureAt < chosen.departureAt ||
      (candidate.departureAt === chosen.departureAt &&
        candidate.candidate < chosen.candidate)
    ) {
      chosen = candidate;
    }
  }
  return chosen;
}

function finishTransitStep(
  step: BusEstimateStep | SubwayEstimateStep,
  basis: SnapshotBasis,
  chosen: DepartureCandidate | null,
  readiness: number,
): TransitOutcome {
  if (chosen !== null) {
    return {
      estimate: {
        stepId: step.id,
        basis: "live",
        startAt: readiness,
        waitSeconds: (chosen.departureAt - readiness) / 1000,
        departureAt: chosen.departureAt,
        endAt: chosen.departureAt + step.rideMinutes * MINUTE_MS,
        matchedCandidate: chosen.candidate,
      },
      nextCursor: chosen.departureAt + step.rideMinutes * MINUTE_MS,
      blocked: false,
    };
  }
  if (step.fallbackWaitMinutes !== undefined) {
    const departureAt = readiness + step.fallbackWaitMinutes * MINUTE_MS;
    const endAt = departureAt + step.rideMinutes * MINUTE_MS;
    return {
      estimate: {
        stepId: step.id,
        basis: basis === "live" ? "estimated" : basis,
        startAt: readiness,
        waitSeconds: step.fallbackWaitMinutes * 60,
        departureAt,
        endAt,
        matchedCandidate: null,
      },
      nextCursor: endAt,
      blocked: false,
    };
  }
  return {
    estimate: {
      stepId: step.id,
      basis: basis === "live" ? "estimated" : basis,
      startAt: readiness,
      waitSeconds: null,
      departureAt: null,
      endAt: null,
      matchedCandidate: null,
    },
    nextCursor: readiness,
    blocked: true,
  };
}

function evaluateBusStep(
  step: BusEstimateStep,
  sources: readonly BusArrivalsSource[],
  readiness: number,
  now: number,
): TransitOutcome {
  const source = sources.find((candidate) => candidate.stopId === step.stopId);
  const basis = snapshotBasis(source, now);
  let chosen: DepartureCandidate | null = null;
  if (
    basis === "live" &&
    source !== undefined &&
    source.arrivals !== null &&
    source.successAt !== null
  ) {
    const direction = normalizeServiceText(step.direction);
    const candidates: DepartureCandidate[] = [];
    for (const arrival of source.arrivals) {
      if (
        arrival.routeId !== step.routeId ||
        normalizeServiceText(arrival.direction) !== direction
      ) {
        continue;
      }
      if (arrival.first.seconds !== null) {
        candidates.push({
          departureAt: source.successAt + arrival.first.seconds * 1000,
          candidate: `${arrival.routeId}:first`,
        });
      }
      if (arrival.second !== null && arrival.second.seconds !== null) {
        candidates.push({
          departureAt: source.successAt + arrival.second.seconds * 1000,
          candidate: `${arrival.routeId}:second`,
        });
      }
    }
    chosen = chooseDeparture(candidates, readiness);
  }
  return finishTransitStep(step, basis, chosen, readiness);
}

function evaluateSubwayStep(
  step: SubwayEstimateStep,
  sources: readonly SubwayArrivalsSource[],
  readiness: number,
  now: number,
): TransitOutcome {
  const source = sources.find(
    (candidate) => candidate.stationId === step.stationId,
  );
  const basis = snapshotBasis(source, now);
  let chosen: DepartureCandidate | null = null;
  if (
    basis === "live" &&
    source !== undefined &&
    source.arrivals !== null &&
    source.successAt !== null
  ) {
    const candidates: DepartureCandidate[] = [];
    for (const arrival of source.arrivals) {
      if (
        arrival.subwayId !== step.subwayId ||
        arrival.updnLine !== step.updnLine
      ) {
        continue;
      }
      if (arrival.seconds !== null) {
        candidates.push({
          departureAt: source.successAt + arrival.seconds * 1000,
          candidate: arrival.id,
        });
      }
    }
    chosen = chooseDeparture(candidates, readiness);
  }
  return finishTransitStep(step, basis, chosen, readiness);
}

function unevaluatedStep(stepId: CommuteStepId): CommuteStepEstimate {
  return {
    stepId,
    basis: "unavailable",
    startAt: null,
    waitSeconds: null,
    departureAt: null,
    endAt: null,
    matchedCandidate: null,
  };
}

export function estimateCommuteProcedure(
  input: CommuteEstimateInput,
): CommuteEstimate {
  const { procedure, now } = input;
  const busSources = input.busArrivals ?? [];
  const subwaySources = input.subwayArrivals ?? [];
  const steps: CommuteStepEstimate[] = [];
  let cursor = now;
  let leaveBy: number | null = null;
  let blockedAtStepId: CommuteStepId | null = null;
  let seenFirstTransit = false;

  for (const step of procedure.steps) {
    if (blockedAtStepId !== null) {
      steps.push(unevaluatedStep(step.id));
      continue;
    }

    if (step.kind === "walk") {
      const endAt = cursor + step.minutes * MINUTE_MS;
      steps.push({
        stepId: step.id,
        basis: "estimated",
        startAt: cursor,
        waitSeconds: null,
        departureAt: null,
        endAt,
        matchedCandidate: null,
      });
      cursor = endAt;
      continue;
    }

    const startAt = cursor;
    const outcome =
      step.kind === "bus"
        ? evaluateBusStep(step, busSources, startAt, now)
        : evaluateSubwayStep(step, subwaySources, startAt, now);

    // Leave guidance exists only when the first transit step of the procedure
    // is ITSELF backed by a live, catchable departure. The latch closes on
    // the first transit outcome whatever its basis, so a later live step can
    // never lend leave guidance to a fallback-backed first transit.
    if (!seenFirstTransit) {
      seenFirstTransit = true;
      if (
        outcome.estimate.basis === "live" &&
        outcome.estimate.departureAt !== null
      ) {
        leaveBy = outcome.estimate.departureAt - (startAt - now);
      }
    }
    if (outcome.blocked) {
      blockedAtStepId = step.id;
    }
    cursor = outcome.nextCursor;
    steps.push(outcome.estimate);
  }

  return {
    procedureId: procedure.id,
    arrivalAt: blockedAtStepId === null ? cursor : null,
    leaveBy,
    blockedAtStepId,
    steps,
  };
}
