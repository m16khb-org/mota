import type { TransitMapNetwork } from "@mota/contracts/transit-map";

export type Coordinate = readonly [number, number];
export type RouteCollection = TransitMapNetwork["subway"]["lines"];
const METRES_PER_DEGREE = 111_195;
const LONGITUDE_METRES = METRES_PER_DEGREE * Math.cos((37.55 * Math.PI) / 180);

export function distance(a: Coordinate, b: Coordinate) {
  return Math.hypot((b[0] - a[0]) * LONGITUDE_METRES, (b[1] - a[1]) * METRES_PER_DEGREE);
}

export function bearing(a: Coordinate, b: Coordinate) {
  return (
    ((Math.atan2((b[0] - a[0]) * LONGITUDE_METRES, (b[1] - a[1]) * METRES_PER_DEGREE) * 180) /
      Math.PI +
      360) %
    360
  );
}

export function mix(a: Coordinate, b: Coordinate, amount: number): [number, number] {
  return [a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount];
}

export function routeKey(value: string) {
  return value.replace(/호선$|선$/g, "").replace(/[·\s]/g, "");
}

export interface RoutePath {
  readonly coordinates: readonly Coordinate[];
  readonly offsets: readonly number[];
  readonly keys: readonly string[];
}

const compiled = new WeakMap<RouteCollection, readonly RoutePath[]>();
export function compileRoutes(collection: RouteCollection): readonly RoutePath[] {
  const cached = compiled.get(collection);
  if (cached) return cached;
  const paths = collection.features.map((feature) => {
    const coordinates = feature.geometry.coordinates;
    const offsets = [0];
    for (let i = 1; i < coordinates.length; i++) {
      const a = coordinates[i - 1];
      const b = coordinates[i];
      if (a && b) offsets.push((offsets[i - 1] ?? 0) + distance(a, b));
    }
    return {
      coordinates,
      offsets,
      keys: [routeKey(feature.properties.routeId), routeKey(feature.properties.routeName)],
    };
  });
  compiled.set(collection, paths);
  return paths;
}

export function projectOnPath(point: Coordinate, path: RoutePath) {
  let best = { distance: Number.POSITIVE_INFINITY, offset: 0, bearing: 0 };
  for (let i = 1; i < path.coordinates.length; i++) {
    const a = path.coordinates[i - 1];
    const b = path.coordinates[i];
    if (!a || !b) continue;
    const dx = (b[0] - a[0]) * LONGITUDE_METRES;
    const dy = (b[1] - a[1]) * METRES_PER_DEGREE;
    const lengthSquared = dx * dx + dy * dy;
    if (!lengthSquared) continue;
    const amount = Math.max(
      0,
      Math.min(
        1,
        ((point[0] - a[0]) * LONGITUDE_METRES * dx + (point[1] - a[1]) * METRES_PER_DEGREE * dy) /
          lengthSquared,
      ),
    );
    const residual = distance(point, mix(a, b, amount));
    if (residual < best.distance) {
      best = {
        distance: residual,
        offset: (path.offsets[i - 1] ?? 0) + Math.sqrt(lengthSquared) * amount,
        bearing: bearing(a, b),
      };
    }
  }
  return best;
}

export function pointAlong(path: RoutePath, offset: number, reverse: boolean) {
  let low = 1;
  let high = path.offsets.length - 1;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((path.offsets[middle] ?? Infinity) < offset) low = middle + 1;
    else high = middle;
  }
  const a = path.coordinates[low - 1];
  const b = path.coordinates[low];
  if (!a || !b) throw new RangeError("Route path needs two coordinates");
  const start = path.offsets[low - 1] ?? 0;
  const length = (path.offsets[low] ?? start) - start;
  return {
    coordinates: mix(a, b, length ? Math.max(0, Math.min(1, (offset - start) / length)) : 0),
    bearing: (bearing(a, b) + (reverse ? 180 : 0)) % 360,
  };
}

/** Rotate local metre offsets clockwise from north; preserve the geographic anchor. */
export function offsetCoordinate(
  center: Coordinate,
  right: number,
  forward: number,
  heading: number,
): [number, number] {
  const radians = (heading * Math.PI) / 180;
  return [
    center[0] +
      (right * Math.cos(radians) + forward * Math.sin(radians)) /
        (METRES_PER_DEGREE * Math.cos((center[1] * Math.PI) / 180)),
    center[1] + (forward * Math.cos(radians) - right * Math.sin(radians)) / METRES_PER_DEGREE,
  ];
}
