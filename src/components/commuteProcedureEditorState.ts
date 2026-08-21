import type { CommuteFavorite, CommuteStep, SavedCommuteProcedure } from "../domain/commute";

export const STEP_KINDS = ["walk", "bus", "subway"] as const;
export type EditorStepKind = (typeof STEP_KINDS)[number];type WalkEditorStep = {
  readonly id: string;
  readonly kind: "walk";
  readonly minutes: string;
};
type TransitEditorStep = {
  readonly id: string;
  readonly kind: "bus" | "subway";
  readonly favoriteId: string;
  readonly pointId: string | null;
  readonly rideMinutes: string;
  readonly fallbackWaitMinutes: string;
};
export type EditorStep = WalkEditorStep | TransitEditorStep;
export type EditorState = { readonly scope: string; readonly name: string; readonly steps: readonly EditorStep[] };

export type EditorAction =
  | { readonly type: "reset"; readonly state: EditorState }
  | { readonly type: "name"; readonly value: string }
  | { readonly type: "add"; readonly step: EditorStep }
  | { readonly type: "remove"; readonly id: string }
  | { readonly type: "move"; readonly id: string; readonly offset: -1 | 1 }
  | { readonly type: "favorite"; readonly id: string; readonly favoriteId: string }
  | { readonly type: "minutes"; readonly id: string; readonly field: "minutes" | "rideMinutes" | "fallbackWaitMinutes"; readonly value: string };

function assertNever(value: never): never { throw new TypeError(`Unexpected editor value: ${JSON.stringify(value)}`); }

function favoriteMatchesStep(favorite: CommuteFavorite, step: CommuteStep): boolean {
  switch (step.kind) {
    case "walk":
      return false;
    case "bus":
      switch (favorite.kind) {
        case "bus":
          return favorite.stopId === step.stopId && favorite.routeId === step.routeId && favorite.direction === step.direction;
        case "subway":
          return false;
        default:
          return assertNever(favorite);
      }
    case "subway":
      switch (favorite.kind) {
        case "bus":
          return false;
        case "subway":
          return favorite.stationId === step.stationId && favorite.subwayId === step.subwayId && favorite.updnLine === step.updnLine;
        default:
          return assertNever(favorite);
      }
    default:
      return assertNever(step);
  }
}

function editorStepFromReady(step: CommuteStep, favorites: readonly CommuteFavorite[]): EditorStep {
  switch (step.kind) {
    case "walk":
      return { id: step.id, kind: "walk", minutes: String(step.minutes) };
    case "bus":
      return {
        id: step.id,
        kind: "bus",
        favoriteId: favorites.find((favorite) => favoriteMatchesStep(favorite, step))?.id ?? "",
        pointId: step.stopId,
        rideMinutes: String(step.rideMinutes),
        fallbackWaitMinutes: String(step.fallbackWaitMinutes),
      };
    case "subway":
      return {
        id: step.id,
        kind: "subway",
        favoriteId: favorites.find((favorite) => favoriteMatchesStep(favorite, step))?.id ?? "",
        pointId: step.stationId,
        rideMinutes: String(step.rideMinutes),
        fallbackWaitMinutes: String(step.fallbackWaitMinutes),
      };
    default:
      return assertNever(step);
  }
}

export function createEditorState(procedure: SavedCommuteProcedure | null, favorites: readonly CommuteFavorite[], scope: string): EditorState {
  if (procedure === null) return { scope, name: "", steps: [] };
  return { scope, name: procedure.name, steps: procedure.steps.map((step) => editorStepFromReady(step, favorites)) };
}

export function createEditorStep(kind: EditorStepKind, id: string): EditorStep {
  switch (kind) {
    case "walk":
      return { id, kind, minutes: "" };
    case "bus":
    case "subway":
      return { id, kind, favoriteId: "", pointId: null, rideMinutes: "", fallbackWaitMinutes: "" };
    default:
      return assertNever(kind);
  }
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "reset":
      return action.state;
    case "name":
      return { ...state, name: action.value };
    case "add":
      return { ...state, steps: [...state.steps, action.step] };
    case "remove":
      return { ...state, steps: state.steps.filter((step) => step.id !== action.id) };
    case "move": {
      const fromIndex = state.steps.findIndex((step) => step.id === action.id);
      const toIndex = fromIndex + action.offset;
      if (fromIndex < 0 || toIndex < 0 || toIndex >= state.steps.length) return state;
      const steps = [...state.steps];
      const [moved] = steps.splice(fromIndex, 1);
      if (moved === undefined) return state;
      steps.splice(toIndex, 0, moved);
      return { ...state, steps };
    }
    case "favorite":
      return {
        ...state,
        steps: state.steps.map((step) => {
          if (step.id !== action.id) return step;
          switch (step.kind) {
            case "walk":
              return step;
            case "bus":
            case "subway":
              return { ...step, favoriteId: action.favoriteId };
            default:
              return assertNever(step);
          }
        }),
      };
    case "minutes":
      return {
        ...state,
        steps: state.steps.map((step) => {
          if (step.id !== action.id) return step;
          switch (step.kind) {
            case "walk":
              return action.field === "minutes" ? { ...step, minutes: action.value } : step;
            case "bus":
            case "subway":
              return action.field === "rideMinutes" ? { ...step, rideMinutes: action.value } : action.field === "fallbackWaitMinutes" ? { ...step, fallbackWaitMinutes: action.value } : step;
            default:
              return assertNever(step);
          }
        }),
      };
    default:
      return assertNever(action);
  }
}

export function availableFavorites(step: EditorStep, favorites: readonly CommuteFavorite[]): readonly CommuteFavorite[] {
  switch (step.kind) {
    case "walk":
      return [];
    case "bus":
      return favorites.filter((favorite) => {
        switch (favorite.kind) {
          case "bus":
            return step.pointId === null || favorite.stopId === step.pointId;
          case "subway":
            return false;
          default:
            return assertNever(favorite);
        }
      });
    case "subway":
      return favorites.filter((favorite) => {
        switch (favorite.kind) {
          case "bus":
            return false;
          case "subway":
            return step.pointId === null || favorite.stationId === step.pointId;
          default:
            return assertNever(favorite);
        }
      });
    default:
      return assertNever(step);
  }
}
