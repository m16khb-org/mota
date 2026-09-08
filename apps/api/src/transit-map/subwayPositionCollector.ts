import type {
	TransitAvailability,
	TransitMapHealth,
	SubwayVehicle,
} from "@mota/contracts/transit-map";
import type { RepeatingScheduler } from "../app.tokens";
import type { SubwayPositionResult } from "../upstream/subwayPositions";
import { LiveSourceMetrics } from "./liveSourceMetrics";

export interface SubwayPositionSnapshot {
	readonly availability: TransitAvailability;
	readonly vehicles: readonly SubwayVehicle[];
	readonly capturedAt: string;
}

interface SubwayPositionCollectorOptions {
	readonly lines: readonly string[];
	readonly loadLine: (line: string) => Promise<SubwayPositionResult>;
	readonly scheduler: RepeatingScheduler;
	readonly now?: () => number;
}

type SnapshotListener = (snapshot: SubwayPositionSnapshot) => void;

const MAX_SUBWAY_OBSERVATION_AGE_MS = 90_000;

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
			const now = this.now();
			const vehicles = results
				.flatMap((result) => result.vehicles)
				.filter((vehicle) => isFreshObservation(vehicle.capturedAt, now));
			const hasLiveResult = results.some(
				(result) => result.availability === "live",
			);
			const availability: TransitAvailability =
				vehicles.length > 0
					? "live"
					: hasLiveResult
						? "unavailable"
						: "no-service";
			this.current = freezeSnapshot({
				availability,
				vehicles,
				capturedAt: latestCapture(vehicles, now),
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

function isFreshObservation(capturedAt: string, now: number) {
	const capturedAtMs = Date.parse(capturedAt);
	return Number.isFinite(capturedAtMs) && now - capturedAtMs <= MAX_SUBWAY_OBSERVATION_AGE_MS;
}

function latestCapture(vehicles: readonly SubwayVehicle[], now: number) {
	const latest = vehicles.reduce(
		(latest, vehicle) =>
			vehicle.capturedAt > latest ? vehicle.capturedAt : latest,
		"",
	);
	return latest || new Date(now).toISOString();
}

function freezeSnapshot(snapshot: SubwayPositionSnapshot): SubwayPositionSnapshot {
	return Object.freeze({
		...snapshot,
		vehicles: Object.freeze([...snapshot.vehicles]),
	});
}
