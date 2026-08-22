import { useId } from "react";
import type { AutoCommuteProcedure } from "../domain/commute";
import type {
  AutoCommutePlan,
  AutoLegBasis,
} from "../domain/autoCommuteEstimate";

const timeFormatter = new Intl.DateTimeFormat("ko-KR", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Seoul",
});

const BASIS_LABELS = {
  live: "실시간",
  estimated: "예상",
  stale: "오래됨",
  unavailable: "정보 없음",
} as const satisfies Record<AutoLegBasis, string>;

export type AutoCommuteEtaProps = {
  readonly procedure: AutoCommuteProcedure;
  readonly plan: AutoCommutePlan | null;
  readonly refreshing: boolean;
  readonly onEditProcedure: () => void;
  readonly onRefresh: () => void;
  readonly onSetOrigin: () => void;
};

function formatTime(timestamp: number): string {
  return timeFormatter.format(new Date(timestamp));
}

function waitLabel(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) {
    return rest <= 10 ? "곧\u00A0도착" : `${rest}초\u00A0대기`;
  }
  return `${minutes}분\u00A0대기`;
}

/** Timeline for a points-only procedure: every duration is derived — walk
 * from the saved origin, live boarding choice + wait, geometry ride times. */
export function AutoCommuteEta({
  procedure,
  plan,
  refreshing,
  onEditProcedure,
  onRefresh,
  onSetOrigin,
}: AutoCommuteEtaProps) {
  const headingId = useId();

  if (plan === null || plan.legs.length === 0) {
    return (
      <section className="commute-eta" aria-labelledby={headingId}>
        <div className="commute-eta-heading">
          <div>
            <span className="eyebrow">선택한 통근</span>
            <h2 id={headingId}>{procedure.name}</h2>
          </div>
        </div>
        <p className="commute-eta-summary">
          경유지를 두 개 이상 저장하면 시간을 계산합니다.
        </p>
        <div className="commute-eta-actions">
          <button
            className="secondary-button"
            onClick={onEditProcedure}
            type="button"
          >
            경로 수정
          </button>
        </div>
      </section>
    );
  }

  const hasLive = plan.legs.some((leg) => leg.basis === "live");

  return (
    <section className="commute-eta" aria-labelledby={headingId}>
      <div className="commute-eta-heading">
        <div>
          <span className="eyebrow">선택한 통근</span>
          <h2 id={headingId}>{procedure.name}</h2>
        </div>
        <div className="commute-eta-times">
          {plan.leaveBy !== null ? (
            <div>
              <span>출발 안내</span>
              <strong>
                {plan.leaveBy <= Date.now()
                  ? "지금 출발"
                  : `${formatTime(plan.leaveBy)}까지 출발`}
              </strong>
            </div>
          ) : null}
          {plan.arrivalAt !== null ? (
            <div>
              <span>도착 예정</span>
              <strong>{formatTime(plan.arrivalAt)} 도착</strong>
            </div>
          ) : null}
        </div>
      </div>

      {plan.originMissing ? (
        <p className="commute-eta-summary" role="status">
          출발 위치가 없어 첫 도보 시간과 출발 안내를 계산하지 않습니다.{" "}
          <button
            className="inline-link-button"
            onClick={onSetOrigin}
            type="button"
          >
            현위치로 출발지 설정
          </button>
        </p>
      ) : plan.originWalkMinutes !== null ? (
        <p className="commute-eta-summary">
          출발지에서 첫 정류장까지 도보 {plan.originWalkMinutes}분 포함.
        </p>
      ) : null}

      <p className="commute-eta-summary" aria-live="polite">
        {refreshing
          ? "정보 갱신 중 · 이전 결과를 표시합니다."
          : plan.legs.some((leg) => leg.verified)
            ? "노선 경유지를 실제 지나는 버스로 확인하고 실제 경로 거리로 계산했습니다."
            : hasLive
              ? "거리와 실시간 도착정보로 자동 계산했습니다."
              : "거리 기준 예상 시간입니다. 실시간 정보는 갱신 후 표시됩니다."}
      </p>

      <ol className="commute-eta-timeline">
        {!plan.originMissing && plan.originWalkMinutes !== null ? (
          <li className="commute-eta-step" key="origin-walk">
            <div className="commute-eta-step-copy">
              <strong>출발지에서 도보 {plan.originWalkMinutes}분</strong>
              <span>첫 정류장까지</span>
            </div>
            <span className="commute-eta-basis is-estimated">예상</span>
          </li>
        ) : null}
        {plan.legs.map((leg, index) => (
          <li className="commute-eta-step" key={leg.id}>
            <div className="commute-eta-step-copy">
              <strong>
                {index + 1}. {leg.routeLabel ?? (leg.kind === "bus" ? "버스" : "지하철")}
              </strong>
              <span className="commute-eta-detail">
                {[
                  ...(leg.rideMinutes > 0 ? [`${leg.rideMinutes}분 탑승`] : []),
                  `${leg.fromName} → ${leg.toName}`,
                  waitLabel(leg.waitSeconds),
                  `${formatTime(leg.departureAt)}\u00A0출발`,
                  `${formatTime(leg.endAt)}\u00A0도착`,
                  ...(leg.verified && leg.alightName
                    ? [
                        `${leg.alightName} 하차`,
                        ...(leg.tailWalkMinutes > 0
                          ? [`도보\u00A0${leg.tailWalkMinutes}분`]
                          : []),
                      ]
                    : []),
                ].join("\u00A0· ")}
              </span>
            </div>
            <span className="commute-eta-basis-group">
              <span className={`commute-eta-basis is-${leg.basis}`}>
                {BASIS_LABELS[leg.basis]}
              </span>
              {leg.verified ? (
                <span className="commute-eta-verified">노선 확인</span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>

      <div className="commute-eta-actions">
        <button className="secondary-button" onClick={onEditProcedure} type="button">
          경로 수정
        </button>
        <button className="primary-button" onClick={onRefresh} type="button">
          다시 확인
        </button>
      </div>
    </section>
  );
}
