import { useCallback, useEffect, useRef, useState } from "react";
import { fetchArrivals } from "../api/client";
import type { BusArrival, BusStop } from "../domain/bus";
import type { CommuteRouteOptionId } from "../domain/commute";
import { rankRouteWaits } from "../domain/routeComparison";
import type { SubwayStation } from "../domain/subway";
import type { CommutePlace } from "../hooks/useCommuteStops";
import { RouteOptionList } from "./RouteOptionList";

interface RouteComparisonProps {
  readonly place: CommutePlace;
  readonly onAdd: (
    startStopId: BusStop["id"],
    transferStationId: SubwayStation["id"] | null,
  ) => void;
  readonly onRemove: (optionId: CommuteRouteOptionId) => void;
  readonly onSelect: (optionId: CommuteRouteOptionId) => void;
}

export function RouteComparison(props: RouteComparisonProps) {
  const { place } = props;
  const generation = useRef(0);
  const [arrivalsByStop, setArrivalsByStop] = useState<
    ReadonlyMap<
      BusStop["id"],
      {
        readonly arrivals: readonly BusArrival[] | null;
        readonly fresh: boolean;
        readonly failed: boolean;
      }
    >
  >(new Map());

  const refresh = useCallback(async () => {
    const currentGeneration = generation.current + 1;
    generation.current = currentGeneration;
    const stopsById = new Map(
      place.stops.map((stop) => [stop.id, stop] as const),
    );
    const comparedStops = [
      ...new Map(
        place.routeOptions.flatMap((option) => {
          const stop = stopsById.get(option.startStopId);
          return stop ? [[stop.id, stop] as const] : [];
        }),
      ).values(),
    ];
    setArrivalsByStop(
      new Map(
        comparedStops.map((stop) => [
          stop.id,
          { arrivals: null, fresh: false, failed: false },
        ]),
      ),
    );

    await Promise.all(
      comparedStops.map(async (stop) => {
        try {
          const result = await fetchArrivals(stop.arsId);
          if (generation.current !== currentGeneration) {
            return;
          }
          setArrivalsByStop((current) => {
            const next = new Map(current);
            next.set(stop.id, {
              arrivals: result.arrivals,
              fresh: true,
              failed: false,
            });
            return next;
          });
        } catch {
          if (generation.current !== currentGeneration) {
            return;
          }
          setArrivalsByStop((current) => {
            const next = new Map(current);
            next.set(stop.id, {
              arrivals: null,
              fresh: false,
              failed: true,
            });
            return next;
          });
        }
      }),
    );
  }, [place.routeOptions, place.stops]);

  useEffect(() => {
    void refresh();
    return () => {
      generation.current += 1;
    };
  }, [refresh]);

  const waits = rankRouteWaits(
    place.routeOptions.map((option) => {
      const state = arrivalsByStop.get(option.startStopId);
      return {
        id: option.id,
        arrivals: state?.arrivals ?? null,
        fresh: state?.fresh ?? false,
        failed: state?.failed ?? false,
      };
    }),
  );

  return (
    <RouteOptionList
      {...props}
      waits={waits}
      onRefresh={() => void refresh()}
    />
  );
}
