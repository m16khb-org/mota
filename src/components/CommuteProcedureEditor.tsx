import { AlertTriangle, Footprints, Route, TrainFront } from "lucide-react";
import { type SubmitEvent, useEffect, useId, useMemo, useReducer, useRef } from "react";
import type { CommuteDirection } from "../domain/bus";
import type { SavedCommuteProcedure } from "../domain/commute";
import type { CommutePlace } from "../hooks/useCommuteStops";
import type { CommuteProcedureInput } from "../hooks/useCommuteProcedures";
import { CommuteProcedureStep } from "./CommuteProcedureStep";
import {
  createEditorState,
  createEditorStep,
  editorReducer,
} from "./commuteProcedureEditorState";
import { issueFor, validateEditor } from "./commuteProcedureEditorValidation";

export type CommuteProcedureEditorProps = {
  readonly direction: CommuteDirection;
  readonly onCancel: () => void;
  readonly onSave: (procedure: CommuteProcedureInput) => void;
  readonly place: CommutePlace;
  readonly procedure: SavedCommuteProcedure | null;
};

const STEP_ACTIONS = [
  { kind: "walk", label: "도보 추가", icon: Footprints },
  { kind: "bus", label: "버스 추가", icon: Route },
  { kind: "subway", label: "지하철 추가", icon: TrainFront },
] as const;

export function CommuteProcedureEditor({ direction, onCancel, onSave, place, procedure }: CommuteProcedureEditorProps) {
  const headingId = useId();
  const nextStepId = useRef(0);
  const favorites = place.favorites;
  const scope = `${direction}:${place.id}:${procedure?.id ?? "new"}`;
  const initialState = useMemo(
    () => createEditorState(procedure, favorites, scope),
    [favorites, procedure, scope],
  );
  const [storedState, dispatch] = useReducer(editorReducer, initialState);
  const state = storedState.scope === scope ? storedState : initialState;
  const validation = useMemo(() => validateEditor(state, favorites), [favorites, state]);
  const nameError = issueFor(validation.issues, "name");
  const stepsError = issueFor(validation.issues, "steps");

  // Favorites can change while the editor is open (pinning from the arrival
  // rows); only a scope change (direction/place/procedure) restarts the draft.
  useEffect(() => {
    if (storedState.scope === scope) return;
    dispatch({ type: "reset", state: initialState });
  }, [initialState, scope, storedState.scope]);

  const save = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (validation.procedure !== null) onSave(validation.procedure);
  };

  return (
    <section className="procedure-editor" aria-labelledby={headingId}>
      <div className="section-heading procedure-editor-heading">
        <div>
          <span className="eyebrow">순서대로 저장</span>
          <h3 id={headingId}>통근 절차</h3>
        </div>
      </div>

      <form onSubmit={save}>
        <label className="procedure-name-field">
          <span>절차 이름</span>
          <input
            aria-describedby={nameError === null ? undefined : "procedure-name-error"}
            aria-invalid={nameError === null ? undefined : true}
            aria-label="절차 이름"
            onChange={(event) => dispatch({ type: "name", value: event.target.value })}
            type="text"
            value={state.name}
          />
          {nameError ? <p className="procedure-field-error" id="procedure-name-error" role="alert"><AlertTriangle aria-hidden="true" />{nameError}</p> : null}
        </label>

        {state.steps.length > 0 ? (
          <ol className="procedure-step-list">
            {state.steps.map((step, index) => (
              <CommuteProcedureStep
                dispatch={dispatch}
                favorites={favorites}
                index={index}
                issues={validation.issues}
                key={step.id}
                place={place}
                step={step}
                stepCount={state.steps.length}
              />
            ))}
          </ol>
        ) : <p className="procedure-empty">도보, 버스, 지하철 순서를 추가하세요.</p>}

        <fieldset className="procedure-add-actions">
          <legend className="sr-only">절차 단계 추가</legend>
          {STEP_ACTIONS.map((action) => {
            const Icon = action.icon;
            return <button className="secondary-button" key={action.kind} onClick={() => { nextStepId.current += 1; dispatch({ type: "add", step: createEditorStep(action.kind, `new-${nextStepId.current}`) }); }} type="button"><Icon aria-hidden="true" />{action.label}</button>;
          })}
        </fieldset>
        {stepsError ? <p className="procedure-field-error" role="alert"><AlertTriangle aria-hidden="true" />{stepsError}</p> : null}
        {validation.procedure === null && validation.issues[0] ? <p aria-live="polite" className="procedure-save-status"><AlertTriangle aria-hidden="true" />저장하려면 {validation.issues[0].message}</p> : null}
        <div className="procedure-editor-actions">
          <button className="primary-button" disabled={validation.procedure === null} type="submit">절차 저장</button>
          <button className="secondary-button" onClick={() => { dispatch({ type: "reset", state: initialState }); onCancel(); }} type="button">편집 취소</button>
        </div>
      </form>
    </section>
  );
}
