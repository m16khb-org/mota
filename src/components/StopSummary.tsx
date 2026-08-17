import { Info, MapPinned, Pencil, Route } from "lucide-react";
import type { BusStop, CommuteDirection } from "../domain/bus";

interface StopSummaryProps {
  readonly direction: CommuteDirection;
  readonly stop: BusStop | null;
  readonly onEdit: () => void;
}
const COPY = {
  company: {
    eyebrow: "집 → 회사",
    title: "회사로 갈 정류장",
    description: "집 근처에서 회사 방향 버스를 타는 정류장",
  },
  home: {
    eyebrow: "회사 → 집",
    title: "집으로 갈 정류장",
    description: "회사나 역 근처에서 집 방향 버스를 타는 정류장",
  },
} as const;

export function StopSummary({ direction, stop, onEdit }: StopSummaryProps) {
  const copy = COPY[direction];

  return (
    <section className="stop-summary" aria-labelledby="stop-summary-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{copy.eyebrow}</span>
          <h2 id="stop-summary-title">{copy.title}</h2>
        </div>
        {stop ? (
          <button className="icon-button" type="button" onClick={onEdit} aria-label="정류장 변경">
            <Pencil aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {stop ? (
        <div className="selected-stop-card">
          <span className="stop-signal" aria-hidden="true" />
          <div className="stop-icon">
            <MapPinned aria-hidden="true" />
          </div>
          <div>
            <strong>{stop.name}</strong>
            <span>ARS {stop.arsId}</span>
          </div>
        </div>
      ) : (
        <div className="empty-stop">
          <Route aria-hidden="true" />
          <p>{copy.description}</p>
          <button className="primary-button" type="button" onClick={onEdit}>
            지도에서 정류장 선택
          </button>
        </div>
      )}
      <p className="stop-identity-hint">
        <Info aria-hidden="true" />
        반대편 정류장은 ARS 번호가 다릅니다.
      </p>
    </section>
  );
}
