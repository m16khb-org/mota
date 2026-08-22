/** Geometry-based travel-time suggestions for commute procedure steps.
 *
 * Pure derivation from straight-line distance between the step's known
 * points. These are editor defaults the user can override; they are never
 * persisted as a distinct kind and never presented as live data. */

export interface TravelPoint {
  readonly lat: number;
  readonly lng: number;
}

/** Walking pace 4.5 km/h. */
const WALK_METERS_PER_MINUTE = 75;
/** City bus door-to-door pace incl. stops ~15 km/h. */
const BUS_METERS_PER_MINUTE = 250;
/** Subway pace incl. station dwell ~33 km/h. */
const SUBWAY_METERS_PER_MINUTE = 550;
/** Surface routes are longer than straight lines; typical detour factors. */
const BUS_CIRCUITY = 1.4;
const SUBWAY_CIRCUITY = 1.25;
/** Below this the two points are effectively the same place (transfers at
 * one stop), and a derived duration would be meaningless. */
const MIN_MEANINGFUL_METERS = 50;

const EARTH_RADIUS_METERS = 6_371_000;

export function haversineMeters(a: TravelPoint, b: TravelPoint): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const phi1 = toRadians(a.lat);
  const phi2 = toRadians(b.lat);
  const deltaPhi = toRadians(b.lat - a.lat);
  const deltaLambda = toRadians(b.lng - a.lng);
  const haversine =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine));
}

function suggestMinutes(
  from: TravelPoint,
  to: TravelPoint,
  metersPerMinute: number,
  circuity: number,
): number | null {
  const meters = haversineMeters(from, to);
  if (meters < MIN_MEANINGFUL_METERS) {
    return null;
  }
  return Math.max(1, Math.ceil((meters * circuity) / metersPerMinute));
}

/** Minutes walking between two points, or null when they coincide. */
export function suggestWalkMinutes(
  from: TravelPoint,
  to: TravelPoint,
): number | null {
  return suggestMinutes(from, to, WALK_METERS_PER_MINUTE, 1);
}

/** Minutes riding a bus between two points (detour-adjusted), or null. */
export function suggestBusRideMinutes(
  from: TravelPoint,
  to: TravelPoint,
): number | null {
  return suggestMinutes(from, to, BUS_METERS_PER_MINUTE, BUS_CIRCUITY);
}

/** Minutes riding a subway between two points (detour-adjusted), or null. */
export function suggestSubwayRideMinutes(
  from: TravelPoint,
  to: TravelPoint,
): number | null {
  return suggestMinutes(from, to, SUBWAY_METERS_PER_MINUTE, SUBWAY_CIRCUITY);
}
