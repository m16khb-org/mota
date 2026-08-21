import { useId } from "react";
import type { CommuteProcedure, CommuteStep } from "../domain/commute";
import type {
  CommuteEstimate,
  CommuteStepEstimate,
  CommuteStepEstimateBasis,
} from "../domain/commuteEstimate";

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
} as const satisfies Record<CommuteStepEstimateBasis, string>;

export type CommuteEtaProps = {
  readonly procedure: CommuteProcedure;
  readonly result: CommuteEstimate;
  /** Adapted from Task 5/6 snapshots; freshness remains owned by the estimator. */
  readonly refreshing: boolean;
  readonly onEditProcedure: () => void;
  readonly onRefresh: () => void;
};

function assertNever(value: never): never {
  throw new TypeError(`Unexpected commute step: ${String(value)}`);
}

function formatTime(timestamp: number): string {
  return timeFormatter.format(new Date(timestamp));
}

function stepLabel(step: CommuteStep): string {
  switch (step.kind) {
    case "walk":
      return `${step.minutes}분 걷기`;
    case "bus":
      return /^\d+$/.test(step.routeName)
        ? `${step.routeName}번 버스`
        : `${step.routeName} 버스`;
    case "subway":
      return `${step.lineName} ${step.trainLineNm}`;
    default:
      return assertNever(step);
  }
}

function stepTime(estimate: CommuteStepEstimate): string {
  if (estimate.endAt === null) {
    return "시간 확인 필요";
  }
  if (estimate.departureAt === null) {
    return `${formatTime(estimate.endAt)} 도착`;
  }
  return `${formatTime(estimate.departureAt)} 출발 · ${formatTime(estimate.endAt)} 도착`;
}

function summary(result: CommuteEstimate, refreshing: boolean): string {
  if (refreshing) {
    return "정보 갱신 중 · 이전 결과를 표시합니다.";
  }
  if (result.blockedAtStepId !== null) {
    return "일부 경로의 시간을 확인하지 못했습니다.";
  }
  const hasLiveStep = result.steps.some((step) => step.basis === "live");
  if (!hasLiveStep) {
    return "저장한 이동 시간과 대기 시간으로 계산했습니다.";
  }
  return "저장한 이동 시간과 최신 대기 정보를 반영했습니다.";
}

export function CommuteEta({
  procedure,
  result,
  refreshing,
  onEditProcedure,
  onRefresh,
}: CommuteEtaProps) {
  const headingId = useId();
  const estimatesByStepId = new Map(
    result.steps.map((estimate) => [estimate.stepId, estimate] as const),
  );
  const steps = procedure.steps.flatMap((step) => {
    const estimate = estimatesByStepId.get(step.id);
    return estimate === undefined ? [] : [{ step, estimate }];
  });

  return (
    <section className="commute-eta" aria-labelledby={headingId}>
      <div className="commute-eta-heading">
        <div>
          <span className="eyebrow">선택한 통근</span>
          <h2 id={headingId}>{procedure.name}</h2>
        </div>
        <div className="commute-eta-times">
          {result.leaveBy !== null ? (
            <div>
              <span>출발 안내</span>
              <strong>{formatTime(result.leaveBy)}까지 출발</strong>
            </div>
          ) : null}
          {result.arrivalAt !== null ? (
            <div>
              <span>도착 예정</span>
              <strong>{formatTime(result.arrivalAt)} 도착</strong>
            </div>
          ) : null}
        </div>
      </div>

      <p className="commute-eta-summary" aria-live="polite">
        {summary(result, refreshing)}
      </p>

      <ol className="commute-eta-timeline">
        {steps.map(({ step, estimate }, index) => (
          <li className="commute-eta-step" key={step.id}>
            <div className="commute-eta-step-copy">
              <strong>
                {index + 1}. {stepLabel(step)}
              </strong>
              <span>{stepTime(estimate)}</span>
            </div>
            <span className={`commute-eta-basis is-${estimate.basis}`}>
              {BASIS_LABELS[estimate.basis]}
            </span>
          </li>
        ))}
      </ol>

      {result.blockedAtStepId !== null ? (
        <div className="commute-eta-blocked" role="alert">
          <p>이후 단계의 출발 시간을 정할 수 없습니다.</p>
          <span>저장한 시간 입력을 확인하거나 도착정보를 다시 확인하세요.</span>
          <div className="commute-eta-actions">
            <button className="secondary-button" type="button" onClick={onEditProcedure}>
              경로 수정
            </button>
            <button className="primary-button" type="button" onClick={onRefresh}>
              다시 확인
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
