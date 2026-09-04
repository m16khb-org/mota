import type { TransitVehicle } from "@mota/contracts/transit-map";
import {
  compileRoutes,
  distance,
  pointAlong,
  projectOnPath,
  routeKey,
  type RouteCollection,
  type RoutePath,
  type Coordinate,
} from "./transitGeometry";

/** Prepare projections once per snapshot, not once per animation frame. */
export function prepareVehicleTransition(
  previous: readonly TransitVehicle[],
  next: readonly TransitVehicle[],
  routes: RouteCollection,
) {
  const previousById = new Map(previous.map((vehicle) => [vehicle.id, vehicle]));
  const paths = compileRoutes(routes);
  const transitions = next.map((observed) => {
    const vehicle = { ...observed };
    const prior = previousById.get(vehicle.id);
    const keys = [routeKey(vehicle.routeId), routeKey(vehicle.routeName)];
    const candidates = paths.filter((path) => path.keys.some((key) => keys.includes(key)));
    const tolerance = vehicle.mode === "bus" ? 80 : 400;
    let closest = { distance: tolerance, bearing: vehicle.bearing };
    for (const path of candidates) {
      const projection = projectOnPath(vehicle.coordinates, path);
      if (projection.distance < closest.distance) closest = projection;
    }
    if (closest.distance < tolerance) {
      const reference = prior?.routeId === vehicle.routeId ? prior.bearing : vehicle.bearing;
      const difference = Math.abs(((closest.bearing - reference + 540) % 360) - 180);
      vehicle.bearing = (closest.bearing + (difference > 90 ? 180 : 0)) % 360;
    }
    if (
      !prior ||
      prior.routeId !== vehicle.routeId ||
      prior.capturedAt === vehicle.capturedAt ||
      distance(prior.coordinates, vehicle.coordinates) < 1
    )
      return { vehicle };
    let best:
      | {
          path: RoutePath;
          start: number;
          end: number;
          residual: number;
          startPoint: Coordinate;
          endPoint: Coordinate;
        }
      | undefined;
    const motionTolerance = vehicle.mode === "bus" ? 20 : 40;
    const elapsed = (Date.parse(vehicle.capturedAt) - Date.parse(prior.capturedAt)) / 1000;
    if (elapsed <= 0 || elapsed > 90) return { vehicle };
    for (const path of candidates) {
      const start = projectOnPath(prior.coordinates, path);
      const end = projectOnPath(vehicle.coordinates, path);
      const travelled = Math.abs(end.offset - start.offset);
      // Reject long detours, discontinuous observations and implausible jumps.
      if (
        start.distance > motionTolerance ||
        end.distance > motionTolerance ||
        travelled > Math.max(300, elapsed * (vehicle.mode === "bus" ? 35 : 55))
      )
        continue;
      const residual = start.distance + end.distance;
      if (!best || residual < best.residual)
        best = {
          path,
          start: start.offset,
          end: end.offset,
          residual,
          startPoint: pointAlong(path, start.offset, false).coordinates,
          endPoint: pointAlong(path, end.offset, false).coordinates,
        };
    }
    return { vehicle, prior, best };
  });
  return (progress: number): readonly TransitVehicle[] =>
    transitions.map(({ vehicle, prior, best }) => {
      if (!prior || !best) return vehicle;
      const amount = Math.max(0, Math.min(1, progress));
      const projected = pointAlong(
        best.path,
        best.start + (best.end - best.start) * amount,
        best.end < best.start,
      );
      return {
        ...vehicle,
        ...projected,
        coordinates:
          amount === 0
            ? prior.coordinates
            : amount === 1
              ? vehicle.coordinates
              : [
                  projected.coordinates[0] +
                    (prior.coordinates[0] - best.startPoint[0]) * (1 - amount) +
                    (vehicle.coordinates[0] - best.endPoint[0]) * amount,
                  projected.coordinates[1] +
                    (prior.coordinates[1] - best.startPoint[1]) * (1 - amount) +
                    (vehicle.coordinates[1] - best.endPoint[1]) * amount,
                ],
      };
    });
}
