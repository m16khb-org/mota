import { haversineMeters } from "./commuteTravelTime";

/** Pure subway waypoint verification from the LIVE direction label itself.
 *
 * Seoul's arrival rows name both the terminus (`별내행`) and the next way
 * station (`천호(풍납토성)방면`) in `trainLineNm`. A train provably passes
 * the waypoint when the waypoint's name matches the terminus or the via
 * label — no external line-sequence source needed. Ride time uses the two
 * stations' coordinates (metro tunnels run close to straight between
 * adjacent saved stations). */

/** Seoul metro commercial speed incl. dwell ≈ 30 km/h. */
const SUBWAY_KMH = 30;

export interface SubwayLegVerification {
  readonly alightName: string;
  readonly pathMeters: number;
  readonly pathMinutes: number;
  /** Why the direction was accepted: matched the terminus or the via name. */
  readonly basis: "terminus" | "via";
}

export interface VerifySubwayLegInput {
  /** Boarding station name as saved (OSM short form, e.g. `천호`). */
  readonly boardName: string;
  readonly board: { readonly lat: number; readonly lng: number };
  /** The waypoint (saved station) the leg must end near. */
  readonly alightName: string;
  readonly alight: { readonly lat: number; readonly lng: number };
  /** Live `trainLineNm`, e.g. `방화행 - 광나루(장신대)방면`. */
  readonly directionLabel: string;
}

/** Normalizes station names for matching: drops parenthesized official
 * names (`천호(풍납토성)` → `천호`), the 역 suffix, and spacing. */
function nameCore(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, "")
    .replace(/역$/, "")
    .toLowerCase();
}

/** Splits a `trainLineNm` into terminus and via label cores. */
function splitDirection(
  label: string,
): { terminus: string; via: string } {
  const normalized = label.normalize("NFC");
  const dash = normalized.indexOf(" - ");
  const head = dash === -1 ? normalized : normalized.slice(0, dash);
  const tail = dash === -1 ? "" : normalized.slice(dash + 3);
  const terminus = head.replace(/행$/, "");
  const via = tail.replace(/방면$/, "");
  return { terminus: nameCore(terminus), via: nameCore(via) };
}

function namesMatch(candidate: string, target: string): boolean {
  if (candidate.length < 2 || target.length < 2) {
    return false;
  }
  return candidate.includes(target) || target.includes(candidate);
}

/** Verifies the live train direction passes the waypoint and computes the
 * ride time between the two stations' coordinates. Returns null when the
 * direction label names neither the waypoint's terminus nor its via — the
 * leg then keeps its honest geometry fallback. */
export function verifySubwayLeg(
  input: VerifySubwayLegInput,
): SubwayLegVerification | null {
  const waypoint = nameCore(input.alightName);
  if (waypoint.length < 2) {
    return null;
  }
  const { terminus, via } = splitDirection(input.directionLabel);
  const board = nameCore(input.boardName);
  // Boarding station named as the via means the train is approaching it,
  // not departing toward the waypoint; only terminus/via beyond count.
  const viaIsBoard = via.length >= 2 && board.length >= 2 && namesMatch(via, board);
  let basis: "terminus" | "via" | null = null;
  if (namesMatch(terminus, waypoint)) {
    basis = "terminus";
  } else if (!viaIsBoard && namesMatch(via, waypoint)) {
    basis = "via";
  }
  if (basis === null) {
    return null;
  }
  const meters = haversineMeters(input.board, input.alight);
  return {
    alightName: input.alightName,
    pathMeters: Math.round(meters),
    pathMinutes: Math.max(1, Math.ceil(meters / ((SUBWAY_KMH * 1000) / 60))),
    basis,
  };
}
