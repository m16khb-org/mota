import type {
	TransitAvailability,
	TransitMapHealth,
	TransitVehicle,
} from "@mota/contracts/transit-map";
import type { RepeatingScheduler } from "../app.tokens";
import type { SubwayPositionResult } from "../upstream/subwayPositions";
import { LiveSourceMetrics } from "./liveSourceMetrics";

export interface SubwayPositionSnapshot {
	readonly availability: TransitAvailability;
	readonly vehicles: readonly TransitVehicle[];
	readonly capturedAt: string;
}

interface SubwayPositionCollectorOptions {
	readonly lines: readonly string[];
	readonly loadLine: (line: string) => Promise<SubwayPositionResult>;
	readonly scheduler: RepeatingScheduler;
	readonly now?: () => number;
}

type SnapshotListener = (snapshot: SubwayPositionSnapshot) => void;

export class SubwayPositionCollector {
	private readonly listeners = new Set<SnapshotListener>();
	private readonly now: () => number;
	private readonly metrics: LiveSourceMetrics;
	private current: SubwayPositionSnapshot;
	private inFlight: Promise<void> | null = null;
	private stopSchedule: (() => void) | null = null;

	constructor(private readonly options: SubwayPositionCollectorOptions) {
		this.now = options.now ?? Date.now;
		this.metrics = new LiveSourceMetrics(this.now);
		this.current = freezeSnapshot({
			availability: "unavailable",
			vehicles: [],
			capturedAt: new Date(this.now()).toISOString(),
		});
	}

	subscribe(listener: SnapshotListener): () => void {
		this.listeners.add(listener);
		listener(this.current);
		if (this.listeners.size === 1) {
			this.stopSchedule = this.options.scheduler.every(10_000, () => this.poll());
			void this.poll();
		}
		let active = true;
		return () => {
			if (!active) return;
			active = false;
			this.listeners.delete(listener);
			if (this.listeners.size === 0) {
				this.stopSchedule?.();
				this.stopSchedule = null;
			}
		};
	}

	snapshot(): SubwayPositionSnapshot {
		return this.current;
	}

	status(): TransitMapHealth["subway"] {
		return this.metrics.snapshot(this.current.availability);
	}

	poll(): Promise<void> {
		this.inFlight ??= this.collect().finally(() => {
			this.inFlight = null;
		});
		return this.inFlight;
	}

	private async collect() {
		const startedAt = this.now();
		try {
			const results = await Promise.all(
				this.options.lines.map((line) => this.options.loadLine(line)),
			);
			const vehicles = results.flatMap((result) => result.vehicles);
			const availability: TransitAvailability = results.some(
				(result) => result.availability === "live",
			)
				? "live"
				: "no-service";
			this.current = freezeSnapshot({
				availability,
				vehicles,
				capturedAt: latestCapture(results, this.now),
			});
			this.metrics.recordSuccess(this.now() - startedAt);
		} catch {
			this.current = freezeSnapshot({
				availability: "unavailable",
				vehicles: [],
				capturedAt: new Date(this.now()).toISOString(),
			});
			this.metrics.recordFailure(this.now() - startedAt);
		}
		for (const listener of this.listeners) listener(this.current);
	}
}

function latestCapture(
	results: readonly SubwayPositionResult[],
	now: () => number,
) {
	const latest = results.reduce(
		(latest, result) => (result.capturedAt > latest ? result.capturedAt : latest),
		"",
	);
	return latest || new Date(now()).toISOString();
}

function freezeSnapshot(snapshot: SubwayPositionSnapshot): SubwayPositionSnapshot {
	return Object.freeze({
		...snapshot,
		vehicles: Object.freeze([...snapshot.vehicles]),
	});
}
