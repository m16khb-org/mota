import type { CommuteFavorite, CommuteStep, ReadyCommuteProcedure } from "../domain/commute";

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
export type EditorState = {
  readonly scope: string;
  readonly name: string;
  readonly steps: readonly EditorStep[];
  /** Minute fields the user authored ("<stepId>:<field>"). Auto-derived
   * values sync with geometry only until the field becomes user-owned. */
  readonly editedFields: ReadonlySet<string>;
};
export type MinuteField = "minutes" | "rideMinutes" | "fallbackWaitMinutes";

export type EditorAction =
  | { readonly type: "reset"; readonly state: EditorState }
  | { readonly type: "name"; readonly value: string }
  | { readonly type: "add"; readonly step: EditorStep }
  | { readonly type: "remove"; readonly id: string }
  | { readonly type: "move"; readonly id: string; readonly offset: -1 | 1 }
  | { readonly type: "favorite"; readonly id: string; readonly favoriteId: string }
  | { readonly type: "minutes"; readonly id: string; readonly field: MinuteField; readonly value: string }
  | { readonly type: "suggest"; readonly id: string; readonly field: MinuteField; readonly value: string };

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

/** Saved durations are user-authored: they never re-sync to geometry. */
function editedFieldsFromSteps(steps: readonly EditorStep[]): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const step of steps) {
    switch (step.kind) {
      case "walk":
        keys.add(`${step.id}:minutes`);
        break;
      case "bus":
      case "subway":
        keys.add(`${step.id}:rideMinutes`);
        keys.add(`${step.id}:fallbackWaitMinutes`);
        break;
    }
  }
  return keys;
}

export function createEditorState(procedure: ReadyCommuteProcedure | null, favorites: readonly CommuteFavorite[], scope: string): EditorState {
  if (procedure === null) return { scope, name: "", steps: [], editedFields: new Set() };
  const steps = procedure.steps.map((step) => editorStepFromReady(step, favorites));
  return { scope, name: procedure.name, steps, editedFields: editedFieldsFromSteps(steps) };
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

/** Applies a minute value to one step, shared by user edits and geometry
 * suggestions. */
function withMinutes(step: EditorStep, field: MinuteField, value: string): EditorStep {
  switch (step.kind) {
    case "walk":
      return field === "minutes" ? { ...step, minutes: value } : step;
    case "bus":
    case "subway":
      return field === "rideMinutes"
        ? { ...step, rideMinutes: value }
        : field === "fallbackWaitMinutes"
          ? { ...step, fallbackWaitMinutes: value }
          : step;
    default:
      return assertNever(step);
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
        steps: state.steps.map((step) => (step.id === action.id ? withMinutes(step, action.field, action.value) : step)),
        editedFields: new Set([...state.editedFields, `${action.id}:${action.field}`]),
      };
    case "suggest":
      return {
        ...state,
        steps: state.steps.map((step) => (step.id === action.id ? withMinutes(step, action.field, action.value) : step)),
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
