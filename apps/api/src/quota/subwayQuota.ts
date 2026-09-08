import type {
  SubwayBudgetDenialReason,
  SubwayBudgetDecision,
} from "@mota/db";

export class SubwayRequestDeniedError extends Error {
  readonly code: "SUBWAY_QUOTA_COOLDOWN" | "SUBWAY_REQUEST_RATE_LIMITED";

  constructor(
    readonly reason: SubwayBudgetDenialReason,
    readonly retryAt: number | null,
  ) {
    super(
      reason === "cooldown"
        ? "Seoul subway API quota is cooling down."
        : "Seoul subway API request budget is rate limited.",
    );
    this.name = "SubwayRequestDeniedError";
    this.code =
      reason === "cooldown"
        ? "SUBWAY_QUOTA_COOLDOWN"
        : "SUBWAY_REQUEST_RATE_LIMITED";
  }
}

export function deniedRequest(decision: SubwayBudgetDecision) {
  if (decision.allowed || decision.reason === undefined) {
    throw new Error("An allowed subway budget decision cannot be denied.");
  }
  return new SubwayRequestDeniedError(decision.reason, decision.retryAt);
}
