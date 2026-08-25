import type {
  CommuteContext,
  TransitSelections,
} from "@mota/contracts/transit-settings";
import { BriefcaseBusiness, House } from "lucide-react";
import type { KeyboardEvent } from "react";

interface CommuteContextSelectorProps {
  readonly activeContext: CommuteContext;
  readonly commutes: TransitSelections["commutes"];
  readonly onChange: (context: CommuteContext) => void;
}

const COMMUTE_OPTIONS = [
  {
    context: "toWork",
    label: "출근",
    route: "집 → 회사",
    Icon: BriefcaseBusiness,
  },
  {
    context: "toHome",
    label: "퇴근",
    route: "회사 → 집",
    Icon: House,
  },
] as const;

function nextContext(
  event: KeyboardEvent<HTMLButtonElement>,
  context: CommuteContext,
): CommuteContext | null {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
    return null;
  }
  return context === "toWork" ? "toHome" : "toWork";
}

export function CommuteContextSelector({
  activeContext,
  commutes,
  onChange,
}: CommuteContextSelectorProps) {
  return (
    <section className="commute-switcher" aria-label="출퇴근 설정">
      <div className="commute-switcher-heading">
        <span className="eyebrow">이동 구분</span>
        <span>정류장·역을 따로 저장해요</span>
      </div>
      <div
        className="commute-tabs"
        role="tablist"
        aria-label="출퇴근 선택"
      >
        {COMMUTE_OPTIONS.map(({ context, label, route, Icon }) => {
          const commute = commutes[context];
          const descriptionId = `commute-tab-${context}-summary`;
          return (
            <button
              key={context}
              id={`commute-tab-${context}`}
              className="commute-tab"
              type="button"
              role="tab"
              aria-label={label}
              aria-describedby={descriptionId}
              aria-selected={activeContext === context}
              tabIndex={activeContext === context ? 0 : -1}
              onClick={() => onChange(context)}
              onKeyDown={(event) => {
                const targetContext = nextContext(event, context);
                if (targetContext === null) {
                  return;
                }
                event.preventDefault();
                onChange(targetContext);
                document
                  .getElementById(`commute-tab-${targetContext}`)
                  ?.focus();
              }}
            >
              <span className="commute-tab-title">
                <Icon aria-hidden="true" />
                <strong>{label}</strong>
                <small>{route}</small>
              </span>
              <span
                className="commute-tab-summary"
                id={descriptionId}
              >
                버스 {commute.busStops.length}곳 · 지하철{" "}
                {commute.selectedSubwayStationId === null
                  ? "미설정"
                  : "설정"}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
