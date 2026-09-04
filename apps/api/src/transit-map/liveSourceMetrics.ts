import type {
	TransitAvailability,
	TransitMapHealth,
} from "@mota/contracts/transit-map";

type SourceHealth = TransitMapHealth["subway"];

export class LiveSourceMetrics {
	private successCount = 0;
	private failureCount = 0;
	private consecutiveFailures = 0;
	private lastSuccessAt: string | null = null;
	private lastFailureAt: string | null = null;
	private lastDurationMs: number | null = null;

	constructor(private readonly now: () => number = Date.now) {}

	recordSuccess(durationMs: number) {
		this.successCount += 1;
		this.consecutiveFailures = 0;
		this.lastSuccessAt = new Date(this.now()).toISOString();
		this.lastDurationMs = Math.max(0, durationMs);
	}

	recordFailure(durationMs: number) {
		this.failureCount += 1;
		this.consecutiveFailures += 1;
		this.lastFailureAt = new Date(this.now()).toISOString();
		this.lastDurationMs = Math.max(0, durationMs);
	}

	snapshot(status: TransitAvailability): SourceHealth {
		return Object.freeze({
			status,
			successCount: this.successCount,
			failureCount: this.failureCount,
			consecutiveFailures: this.consecutiveFailures,
			lastSuccessAt: this.lastSuccessAt,
			lastFailureAt: this.lastFailureAt,
			lastDurationMs: this.lastDurationMs,
		});
	}
}
