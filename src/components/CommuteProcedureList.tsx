import { ArrowDown, ArrowUp, Pencil, Plus, Route, Trash2 } from "lucide-react";
import type {
  CommuteProcedureId,
  SavedCommuteProcedure,
} from "../domain/commute";
import type { CommutePlace } from "../hooks/useCommuteStops";

interface CommuteProcedureListProps {
  readonly place: CommutePlace;
  readonly onAdd: () => void;
  readonly onEdit: (procedureId: CommuteProcedureId) => void;
  readonly onSelect: (procedureId: CommuteProcedureId) => void;
  readonly onRemove: (procedureId: CommuteProcedureId) => void;
  readonly onReorder: (procedureId: CommuteProcedureId, toIndex: number) => void;
}

const KIND_LABEL = { walk: "도보", bus: "버스", subway: "지하철" } as const;

function rowLabel(procedure: SavedCommuteProcedure): string {
  return procedure.name;
}

function rowSummary(procedure: SavedCommuteProcedure): string {
  switch (procedure.kind) {
    case "ready": {
      const kinds = procedure.steps.map((step) => KIND_LABEL[step.kind]);
      return `${procedure.steps.length}단계 · ${kinds.join(" → ")}`;
    }
    case "auto":
      return `${procedure.points.length}개 경유 · 시간 자동 계산`;
  }
}

export function CommuteProcedureList({
  place,
  onAdd,
  onEdit,
  onSelect,
  onRemove,
  onReorder,
}: CommuteProcedureListProps) {
  return (
    <section className="procedure-list" aria-labelledby="procedure-list-title">
      <div className="section-heading procedure-list-heading">
        <div>
          <span className="eyebrow">매일 반복</span>
          <h3 id="procedure-list-title">저장한 절차</h3>
        </div>
        <div className="procedure-list-actions">
          <span>{place.procedures.length}개 저장됨</span>
          <button className="secondary-button" type="button" onClick={onAdd}>
            <Plus aria-hidden="true" />
            절차 추가
          </button>
        </div>
      </div>

      {place.procedures.length > 0 ? (
        <div className="procedure-rows">
          {place.procedures.map((procedure, index) => {
            const label = rowLabel(procedure);
            const summary = rowSummary(procedure);
            const active = procedure.id === place.activeProcedureId;
            return (
              <article
                key={procedure.id}
                className={`procedure-row${active ? " is-active" : ""}`}
              >
                <button
                  className="procedure-row-main"
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSelect(procedure.id)}
                >
                  <strong>{label}</strong>
                  <span>{summary}</span>
                </button>
                <div className="procedure-row-controls">
                  <button
                    className="icon-button"
                    type="button"
                    disabled={index === 0}
                    onClick={() => onReorder(procedure.id, index - 1)}
                    aria-label={`${label} 절차 위로`}
                  >
                    <ArrowUp aria-hidden="true" />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    disabled={index === place.procedures.length - 1}
                    onClick={() => onReorder(procedure.id, index + 1)}
                    aria-label={`${label} 절차 아래로`}
                  >
                    <ArrowDown aria-hidden="true" />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => onEdit(procedure.id)}
                    aria-label={`${label} 절차 편집`}
                  >
                    <Pencil aria-hidden="true" />
                  </button>
                  <button
                    className="icon-button danger"
                    type="button"
                    onClick={() => onRemove(procedure.id)}
                    aria-label={`${label} 절차 삭제`}
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="procedure-list-empty">
          <Route aria-hidden="true" />
          <p>저장한 통근 절차가 없습니다.</p>
        </div>
      )}
    </section>
  );
}
