import type { z } from "zod";
import type { CommuteDirection } from "../domain/bus";
import {
  CommuteFavoriteIdSchema,
  CommuteProcedureIdSchema,
  type CommuteFavorite,
  type CommuteFavoriteId,
  type CommuteProcedureId,
} from "../domain/commute";
import type { commuteFavoriteSchema, commuteProcedureSchema } from "../domain/commute";

/** Unbranded input shapes accepted by the hook mutations; the Zod schemas in
 * `src/domain/commute.ts` stay the single validation boundary. Procedures
 * carry their `kind` in the input (ready | auto). */
type DistributiveOmit<T, K extends keyof never> = T extends unknown
  ? Omit<T, K>
  : never;

export type CommuteProcedureInput = DistributiveOmit<
  z.input<typeof commuteProcedureSchema>,
  "id"
>;
export type CommuteFavoriteInput = DistributiveOmit<
  z.input<typeof commuteFavoriteSchema>,
  "id"
>;

function createRandomIdPart(): string {
  const random = new Uint32Array(2);
  globalThis.crypto.getRandomValues(random);
  const [first = 0, second = 0] = random;
  return `${first.toString(36)}${second.toString(36)}`;
}

export function createPlaceId(direction: CommuteDirection): string {
  return `${direction}-${createRandomIdPart()}`;
}

export function createProcedureId(): CommuteProcedureId {
  return CommuteProcedureIdSchema.parse(`proc-${createRandomIdPart()}`);
}

export function createFavoriteId(): CommuteFavoriteId {
  return CommuteFavoriteIdSchema.parse(`fav-${createRandomIdPart()}`);
}

/** Exact favorite identity: display labels never participate. */
export function favoriteIdentityKey(favorite: CommuteFavorite): string {
  return favorite.kind === "bus"
    ? `bus:${favorite.stopId}:${favorite.routeId}:${favorite.direction}`
    : `subway:${favorite.stationId}:${favorite.subwayId}:${favorite.updnLine}`;
}
