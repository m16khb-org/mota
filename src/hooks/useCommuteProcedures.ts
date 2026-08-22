import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { CommuteDirection } from "../domain/bus";
import {
  commuteFavoriteSchema,
  commuteProcedureSchema,
  type CommuteFavoriteId,
  type CommuteProcedureId,
} from "../domain/commute";
import type { CommuteStops } from "./commuteStopsStorage";
import {
  addProcedureToCommutes,
  editProcedureInCommutes,
  pinFavoriteInCommutes,
  removeProcedureFromCommutes,
  reorderProcedureInCommutes,
  selectProcedureInCommutes,
  unpinFavoriteFromCommutes,
  updateFavoriteInCommutes,
} from "./commuteTransitions";
import {
  createFavoriteId,
  createProcedureId,
  type CommuteFavoriteInput,
  type CommuteProcedureInput,
} from "./commuteIdentity";

export type {
  CommuteFavoriteInput,
  CommuteProcedureInput,
} from "./commuteIdentity";

/** Procedure and favorite mutations for the active place. Zod schemas in
 * `src/domain/commute.ts` stay the single validation boundary. */
export function useCommuteProcedures(
  setCommutes: Dispatch<SetStateAction<CommuteStops>>,
) {
  const addProcedure = useCallback(
    (
      direction: CommuteDirection,
      placeId: string,
      procedure: CommuteProcedureInput,
    ) => {
      const parsed = commuteProcedureSchema.parse({
        ...procedure,
        id: createProcedureId(),
      });
      setCommutes((current) =>
        addProcedureToCommutes(current, direction, placeId, parsed),
      );
    },
    [setCommutes],
  );

  const editProcedure = useCallback(
    (
      direction: CommuteDirection,
      placeId: string,
      procedureId: CommuteProcedureId,
      procedure: CommuteProcedureInput,
    ) => {
      const parsed = commuteProcedureSchema.parse({
        ...procedure,
        id: procedureId,
      });
      setCommutes((current) =>
        editProcedureInCommutes(current, direction, placeId, procedureId, parsed),
      );
    },
    [setCommutes],
  );

  const removeProcedure = useCallback(
    (
      direction: CommuteDirection,
      placeId: string,
      procedureId: CommuteProcedureId,
    ) => {
      setCommutes((current) =>
        removeProcedureFromCommutes(current, direction, placeId, procedureId),
      );
    },
    [setCommutes],
  );

  const reorderProcedure = useCallback(
    (
      direction: CommuteDirection,
      placeId: string,
      procedureId: CommuteProcedureId,
      toIndex: number,
    ) => {
      setCommutes((current) =>
        reorderProcedureInCommutes(
          current,
          direction,
          placeId,
          procedureId,
          toIndex,
        ),
      );
    },
    [setCommutes],
  );

  const selectProcedure = useCallback(
    (
      direction: CommuteDirection,
      placeId: string,
      procedureId: CommuteProcedureId,
    ) => {
      setCommutes((current) =>
        selectProcedureInCommutes(current, direction, placeId, procedureId),
      );
    },
    [setCommutes],
  );

  const pinFavorite = useCallback(
    (
      direction: CommuteDirection,
      placeId: string,
      favorite: CommuteFavoriteInput,
    ) => {
      const parsed = commuteFavoriteSchema.parse({
        ...favorite,
        id: createFavoriteId(),
      });
      setCommutes((current) =>
        pinFavoriteInCommutes(current, direction, placeId, parsed),
      );
    },
    [setCommutes],
  );

  const unpinFavorite = useCallback(
    (
      direction: CommuteDirection,
      placeId: string,
      favoriteId: CommuteFavoriteId,
    ) => {
      setCommutes((current) =>
        unpinFavoriteFromCommutes(current, direction, placeId, favoriteId),
      );
    },
    [setCommutes],
  );

  const updateFavorite = useCallback(
    (
      direction: CommuteDirection,
      placeId: string,
      favoriteId: CommuteFavoriteId,
      favorite: CommuteFavoriteInput,
    ) => {
      const parsed = commuteFavoriteSchema.parse({
        ...favorite,
        id: favoriteId,
      });
      setCommutes((current) =>
        updateFavoriteInCommutes(current, direction, placeId, favoriteId, parsed),
      );
    },
    [setCommutes],
  );

  return {
    addProcedure,
    editProcedure,
    removeProcedure,
    reorderProcedure,
    selectProcedure,
    pinFavorite,
    unpinFavorite,
    updateFavorite,
  } as const;
}
