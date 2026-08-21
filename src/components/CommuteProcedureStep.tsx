import { AlertTriangle, ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import type { Dispatch, ReactNode } from "react";
import type { CommuteFavorite } from "../domain/commute";
import type { CommutePlace } from "../hooks/useCommuteStops";
import {
  availableFavorites,
  type EditorAction,
  type EditorStep,
} from "./commuteProcedureEditorState";
import { issueFor, type EditorIssue } from "./commuteProcedureEditorValidation";

type CommuteProcedureStepProps = {
  readonly dispatch: Dispatch<EditorAction>;
  readonly favorites: readonly CommuteFavorite[];
  readonly index: number;
  readonly place: CommutePlace;
  readonly step: EditorStep;
  readonly issues: readonly EditorIssue[];
  readonly stepCount: number;
};

const STEP_LABEL = { walk: "도보", bus: "버스", subway: "지하철" } as const;

function assertNever(value: never): never {
  throw new TypeError(`Unexpected procedure step: ${JSON.stringify(value)}`);
}

function FieldError({ id, message }: { readonly id: string; readonly message: string | null }) {
  return message === null ? null : <p className="procedure-field-error" id={id} role="alert"><AlertTriangle aria-hidden="true" />{message}</p>;
}

function MinutesField({
  dispatch,
  error,
  field,
  label,
  step,
}: {
  readonly dispatch: Dispatch<EditorAction>;
  readonly error: string | null;
  readonly field: "minutes" | "rideMinutes" | "fallbackWaitMinutes";
  readonly label: string;
  readonly step: EditorStep;
}) {
  let value: string;
  switch (step.kind) {
    case "walk":
      value = field === "minutes" ? step.minutes : "";
      break;
    case "bus":
    case "subway":
      value = field === "rideMinutes" ? step.rideMinutes : field === "fallbackWaitMinutes" ? step.fallbackWaitMinutes : "";
      break;
    default:
      value = assertNever(step);
  }
  const errorId = `${step.id}-${field}-error`;
  return (
    <label className="procedure-field">
      <span>{label}</span>
      <span className="procedure-minute-input">
        <input
          aria-describedby={error === null ? undefined : errorId}
          aria-invalid={error === null ? undefined : true}
          aria-label={label}
          inputMode="numeric"
          min="1"
          onChange={(event) => dispatch({ type: "minutes", id: step.id, field, value: event.target.value })}
          step="1"
          type="number"
          value={value}
        />
        <span>분</span>
      </span>
      <FieldError id={errorId} message={error} />
    </label>
  );
}

export function CommuteProcedureStep({ dispatch, favorites, index, place, step, issues, stepCount }: CommuteProcedureStepProps) {
  const position = index + 1;
  const label = STEP_LABEL[step.kind];
  const selectableFavorites = availableFavorites(step, favorites);
  const favoriteError = issueFor(issues, `${step.id}:favorite`);
  let point: string | null;
  switch (step.kind) {
    case "walk":
      point = null;
      break;
    case "bus": {
      const stop = place.stops.find((candidate) => candidate.id === step.pointId);
      point = stop ? `${stop.name} · ARS ${stop.arsId}` : null;
      break;
    }
    case "subway": {
      const station = place.subwayStations.find((candidate) => candidate.id === step.pointId);
      point = station ? `${station.name} · ${station.line}` : null;
      break;
    }
    default:
      point = assertNever(step);
  }

  let fields: ReactNode;
  switch (step.kind) {
    case "walk":
      fields = <MinutesField dispatch={dispatch} error={issueFor(issues, `${step.id}:minutes`)} field="minutes" label={`${position}번째 도보 시간 (분)`} step={step} />;
      break;
    case "bus":
    case "subway":
      fields = (
        <div className="procedure-transit-fields">
          {point ? <p className="procedure-point">{point}</p> : null}
          <label className="procedure-field">
            <span>{position}번째 {label} 서비스</span>
            <select
              aria-describedby={favoriteError === null ? undefined : `${step.id}-favorite-error`}
              aria-invalid={favoriteError === null ? undefined : true}
              aria-label={`${position}번째 ${label} 서비스`}
              onChange={(event) => dispatch({ type: "favorite", id: step.id, favoriteId: event.target.value })}
              value={step.favoriteId}
            >
              <option value="">즐겨찾기 선택</option>
              {selectableFavorites.map((favorite) => {
                switch (favorite.kind) {
                  case "bus":
                    return <option key={favorite.id} value={favorite.id}>{favorite.routeName} · {favorite.direction}</option>;
                  case "subway":
                    return <option key={favorite.id} value={favorite.id}>{favorite.lineName} · {favorite.trainLineNm}</option>;
                  default:
                    return assertNever(favorite);
                }
              })}
            </select>
            <FieldError id={`${step.id}-favorite-error`} message={favoriteError} />
          </label>
          {selectableFavorites.length === 0 ? <p className="procedure-favorite-empty"><strong>즐겨찾기 없음</strong><a href="#arrival-title">도착 예정에서 즐겨찾기 저장</a></p> : null}
          <div className="procedure-transit-minutes">
            <MinutesField dispatch={dispatch} error={issueFor(issues, `${step.id}:rideMinutes`)} field="rideMinutes" label={`${position}번째 ${label} 탑승 시간 (분)`} step={step} />
            <MinutesField dispatch={dispatch} error={issueFor(issues, `${step.id}:fallbackWaitMinutes`)} field="fallbackWaitMinutes" label={`${position}번째 ${label} 대기 대안 시간 (분)`} step={step} />
          </div>
        </div>
      );
      break;
    default:
      fields = assertNever(step);
  }

  return (
    <li className="procedure-step">
      <div className="procedure-step-heading">
        <h3><span>{position}</span>{label}</h3>
        <div className="procedure-step-controls">
          <button aria-label={`${position}번째 ${label} 위로`} className="icon-button" disabled={index === 0} onClick={() => dispatch({ type: "move", id: step.id, offset: -1 })} type="button"><ArrowUp aria-hidden="true" /></button>
          <button aria-label={`${position}번째 ${label} 아래로`} className="icon-button" disabled={index === stepCount - 1} onClick={() => dispatch({ type: "move", id: step.id, offset: 1 })} type="button"><ArrowDown aria-hidden="true" /></button>
          <button aria-label={`${position}번째 ${label} 단계 삭제`} className="icon-button danger" onClick={() => dispatch({ type: "remove", id: step.id })} type="button"><Trash2 aria-hidden="true" /></button>
        </div>
      </div>
      {fields}
    </li>
  );
}
