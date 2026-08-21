import { CommuteStepIdSchema, commuteProcedureSchema, type CommuteFavorite, type CommuteStep } from "../domain/commute";
import type { CommuteProcedureInput } from "../hooks/useCommuteProcedures";
import { availableFavorites, type EditorState, type EditorStep } from "./commuteProcedureEditorState";

export type EditorIssue = { readonly field: string; readonly message: string };
export type EditorValidation = { readonly issues: readonly EditorIssue[]; readonly procedure: CommuteProcedureInput | null };
type MinuteInput = { readonly raw: string; readonly field: string; readonly label: string; readonly issues: EditorIssue[] };
type ValidationContext = { readonly index: number; readonly favorites: readonly CommuteFavorite[]; readonly issues: EditorIssue[] };

function assertNever(value: never): never { throw new TypeError(`Unexpected validation value: ${JSON.stringify(value)}`); }

function minutesFrom({ raw, field, label, issues }: MinuteInput): number | null {
  if (!/^[1-9]\d*$/.test(raw.trim())) {
    issues.push({ field, message: `${label}: 1분 이상 정수로 입력하세요.` });
    return null;
  }
  const minutes = Number(raw);
  if (!Number.isSafeInteger(minutes)) {
    issues.push({ field, message: `${label}: 1분 이상 정수로 입력하세요.` });
    return null;
  }
  return minutes;
}

function readyStep(step: EditorStep, { index, favorites, issues }: ValidationContext): CommuteStep | null {
  const id = CommuteStepIdSchema.parse(step.id);
  const position = index + 1;
  switch (step.kind) {
    case "walk": {
      const minutes = minutesFrom({ raw: step.minutes, field: `${step.id}:minutes`, label: `${position}번째 도보 시간`, issues });
      return minutes === null ? null : { id, kind: "walk", minutes };
    }
    case "bus": {
      const favorite = availableFavorites(step, favorites).find((candidate) => candidate.id === step.favoriteId) ?? null;
      const rideMinutes = minutesFrom({ raw: step.rideMinutes, field: `${step.id}:rideMinutes`, label: `${position}번째 버스 탑승 시간`, issues });
      const fallbackWaitMinutes = minutesFrom({ raw: step.fallbackWaitMinutes, field: `${step.id}:fallbackWaitMinutes`, label: `${position}번째 버스 대기 대안 시간`, issues });
      if (favorite === null) {
        issues.push({ field: `${step.id}:favorite`, message: `${position}번째 버스 서비스를 선택하세요.` });
        return null;
      }
      switch (favorite.kind) {
        case "bus":
          return rideMinutes === null || fallbackWaitMinutes === null ? null : { id, kind: "bus", stopId: favorite.stopId, arsId: favorite.arsId, routeId: favorite.routeId, routeName: favorite.routeName, direction: favorite.direction, rideMinutes, fallbackWaitMinutes };
        case "subway":
          return null;
        default:
          return assertNever(favorite);
      }
    }
    case "subway": {
      const favorite = availableFavorites(step, favorites).find((candidate) => candidate.id === step.favoriteId) ?? null;
      const rideMinutes = minutesFrom({ raw: step.rideMinutes, field: `${step.id}:rideMinutes`, label: `${position}번째 지하철 탑승 시간`, issues });
      const fallbackWaitMinutes = minutesFrom({ raw: step.fallbackWaitMinutes, field: `${step.id}:fallbackWaitMinutes`, label: `${position}번째 지하철 대기 대안 시간`, issues });
      if (favorite === null) {
        issues.push({ field: `${step.id}:favorite`, message: `${position}번째 지하철 서비스를 선택하세요.` });
        return null;
      }
      switch (favorite.kind) {
        case "bus":
          return null;
        case "subway":
          return rideMinutes === null || fallbackWaitMinutes === null ? null : { id, kind: "subway", stationId: favorite.stationId, apiStationName: favorite.apiStationName, subwayId: favorite.subwayId, updnLine: favorite.updnLine, lineName: favorite.lineName, trainLineNm: favorite.trainLineNm, rideMinutes, fallbackWaitMinutes };
        default:
          return assertNever(favorite);
      }
    }
    default:
      return assertNever(step);
  }
}

export function validateEditor(state: EditorState, favorites: readonly CommuteFavorite[]): EditorValidation {
  const issues: EditorIssue[] = [];
  const name = state.name.trim();
  if (!name) issues.push({ field: "name", message: "절차 이름을 입력하세요." });
  if (state.steps.length === 0) issues.push({ field: "steps", message: "단계를 하나 이상 추가하세요." });
  const steps = state.steps.map((step, index) => readyStep(step, { index, favorites, issues }));
  if (issues.length > 0 || steps.some((step) => step === null)) return { issues, procedure: null };
  const parsed = commuteProcedureSchema.safeParse({ id: "editor-preview", kind: "ready", name, steps });
  if (!parsed.success) return { issues: [{ field: "steps", message: "절차를 다시 확인하세요." }], procedure: null };
  const { id: _id, kind: _kind, ...procedure } = parsed.data;
  return { issues, procedure };
}

export function issueFor(issues: readonly EditorIssue[], field: string): string | null {
  return issues.find((issue) => issue.field === field)?.message ?? null;
}
