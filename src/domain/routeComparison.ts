import type { BusArrival } from "./bus";

export interface RouteWaitInput {
  readonly id: string;
  readonly arrivals: readonly BusArrival[] | null;
  readonly fresh: boolean;
  readonly failed?: boolean;
}

export interface RankedRouteWait {
  readonly id: string;
  readonly fresh: boolean;
  readonly failed: boolean;
  readonly seconds: number | null;
  readonly rank: number | null;
  readonly routeName: string | null;
}

export function rankRouteWaits(
  routes: readonly RouteWaitInput[],
): readonly RankedRouteWait[] {
  const waits = routes.map((route) => {
    if (!route.fresh || route.arrivals === null) {
      return {
        id: route.id,
        fresh: route.fresh,
        failed: route.failed ?? false,
        seconds: null,
        routeName: null,
      };
    }
    const earliest = route.arrivals.reduce<BusArrival | null>(
      (current, arrival) => {
        if (arrival.first.seconds === null) {
          return current;
        }
        if (
          current === null ||
          current.first.seconds === null ||
          arrival.first.seconds < current.first.seconds
        ) {
          return arrival;
        }
        return current;
      },
      null,
    );
    return {
      id: route.id,
      fresh: route.fresh,
      failed: route.failed ?? false,
      seconds: earliest?.first.seconds ?? null,
      routeName: earliest?.routeName ?? null,
    };
  });
  const rankedSeconds = [
    ...new Set(
      waits
        .map((wait) => wait.seconds)
        .filter((seconds): seconds is number => seconds !== null),
    ),
  ].sort((left, right) => left - right);

  return waits.map((wait) => ({
    ...wait,
    rank:
      wait.seconds === null ? null : rankedSeconds.indexOf(wait.seconds) + 1,
  }));
}
