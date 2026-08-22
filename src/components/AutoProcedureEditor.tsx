import { ArrowDown, ArrowUp, MapPin, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import type { ArsId, BusStop } from "../domain/bus";
import type { AutoCommuteProcedure, AutoProcedurePoint } from "../domain/commute";
import type { SubwayStation } from "../domain/subway";
import type { CommutePlace } from "../hooks/useCommuteStops";
import type { CommuteProcedureInput } from "../hooks/useCommuteProcedures";

export type AutoProcedureEditorProps = {
  readonly onCancel: () => void;
  readonly onSave: (procedure: CommuteProcedureInput) => void;
  readonly place: CommutePlace;
  readonly procedure: AutoCommuteProcedure | null;
};

type EditorPoint =
  | {
      readonly type: "stop";
      readonly stopId: BusStop["id"];
      readonly arsId: ArsId;
      readonly label: string;
    }
  | {
      readonly type: "station";
      readonly stationId: SubwayStation["id"];
      readonly apiStationName: string;
      readonly label: string;
    };

function pointKey(point: EditorPoint): string {
  return point.type === "stop" ? `stop:${point.stopId}` : `station:${point.stationId}`;
}

function pointFromStop(stop: CommutePlace["stops"][number]): EditorPoint {
  return {
    type: "stop",
    stopId: stop.id,
    arsId: stop.arsId,
    label: `${stop.name} · ARS ${stop.arsId}`,
  };
}

function pointFromStation(
  station: CommutePlace["subwayStations"][number],
): EditorPoint {
  return {
    type: "station",
    stationId: station.id,
    apiStationName: station.name.replace(/역$/, ""),
    label: `${station.name} · ${station.line}`,
  };
}

/** Points-only itinerary editor: the user picks WHERE (start place origin is
 * separate) and in which order; every duration, service choice, and wait is
 * derived at run time — nothing to type, nothing to compare. */
export function AutoProcedureEditor({
  onCancel,
  onSave,
  place,
  procedure,
}: AutoProcedureEditorProps) {
  const headingId = useId();
  const [name, setName] = useState(procedure?.name ?? "");
  const [points, setPoints] = useState<EditorPoint[]>(() =>
    (procedure?.points ?? []).flatMap((point): EditorPoint[] => {
      if (point.type === "stop") {
        const stop = place.stops.find(
          (candidate) => candidate.id === point.stopId,
        );
        return stop ? [pointFromStop(stop)] : [];
      }
      const station = place.subwayStations.find(
        (candidate) => candidate.id === point.stationId,
      );
      return station ? [pointFromStation(station)] : [];
    }),
  );

  const savedPoints: EditorPoint[] = [
    ...place.stops.map(pointFromStop),
    ...place.subwayStations.map(pointFromStation),
  ];
  const inItinerary = new Set(points.map(pointKey));
  const addable = savedPoints.filter((point) => !inItinerary.has(pointKey(point)));

  const move = (index: number, offset: -1 | 1) => {
    const to = index + offset;
    if (to < 0 || to >= points.length) return;
    const next = [...points];
    const [moved] = next.splice(index, 1);
    if (moved === undefined) return;
    next.splice(to, 0, moved);
    setPoints(next);
  };

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed || points.length === 0) return;
    onSave({
      kind: "auto",
      name: trimmed,
      points: points.map((point): AutoProcedurePoint =>
        point.type === "stop"
          ? { type: "stop", stopId: point.stopId, arsId: point.arsId }
          : {
              type: "station",
              stationId: point.stationId,
              apiStationName: point.apiStationName,
            },
      ),
    });
  };

  return (
    <section className="procedure-editor" aria-labelledby={headingId}>
      <div className="section-heading procedure-editor-heading">
        <div>
          <span className="eyebrow">경로만 선택</span>
          <h3 id={headingId}>통근 절차</h3>
        </div>
      </div>

      <label className="procedure-name-field">
        <span>절차 이름</span>
        <input
          aria-label="절차 이름"
          onChange={(event) => setName(event.target.value)}
          type="text"
          value={name}
        />
      </label>

      {points.length > 0 ? (
        <ol className="procedure-step-list">
          {points.map((point, index) => (
            <li className="procedure-step" key={pointKey(point)}>
              <div className="procedure-step-heading">
                <h3>
                  <span>{index + 1}</span>
                  {point.type === "stop" ? "버스 정류장" : "지하철역"}
                </h3>
                <div className="procedure-step-controls">
                  <button
                    aria-label={`${index + 1}번째 경유지 위로`}
                    className="icon-button"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    type="button"
                  >
                    <ArrowUp aria-hidden="true" />
                  </button>
                  <button
                    aria-label={`${index + 1}번째 경유지 아래로`}
                    className="icon-button"
                    disabled={index === points.length - 1}
                    onClick={() => move(index, 1)}
                    type="button"
                  >
                    <ArrowDown aria-hidden="true" />
                  </button>
                  <button
                    aria-label={`${index + 1}번째 경유지 삭제`}
                    className="icon-button danger"
                    onClick={() =>
                      setPoints(points.filter((_, i) => i !== index))
                    }
                    type="button"
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </div>
              </div>
              <p className="procedure-point">{point.label}</p>
              <p className="procedure-auto-note">
                탑승 노선·대기·이동 시간은 자동 계산됩니다.
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="procedure-empty">
          아래에서 정류장·지하철역을 순서대로 눌러 경로를 만드세요.
        </p>
      )}

      {addable.length > 0 ? (
        <fieldset className="procedure-add-actions auto">
          <legend className="sr-only">경유지 추가</legend>
          {addable.map((point) => (
            <button
              className="secondary-button"
              key={pointKey(point)}
              aria-label={`${point.label} 경유지 추가`}
              onClick={() => setPoints([...points, point])}
              type="button"
            >
              <Plus aria-hidden="true" />
              {point.label}
            </button>
          ))}
        </fieldset>
      ) : points.length === 0 ? (
        <p className="procedure-favorite-empty">
          <MapPin aria-hidden="true" />
          <span>
            <strong>저장된 정류장·역이 없습니다.</strong> 먼저 버스 정류장·지하철역을
            추가하세요.
          </span>
        </p>
      ) : null}

      <div className="procedure-editor-actions">
        <button
          className="primary-button"
          disabled={name.trim() === "" || points.length < 2}
          onClick={save}
          type="button"
        >
          절차 저장
        </button>
        <button className="secondary-button" onClick={onCancel} type="button">
          편집 취소
        </button>
      </div>
    </section>
  );
}
