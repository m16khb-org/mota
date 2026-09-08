import type {
	TransitAvailability,
	TransitMapHealth,
	SubwayVehicle,
} from "@mota/contracts/transit-map";
import {
	SUBWAY_POSITION_MIN_INTERVAL_MS,
	type SubwayRequestBudget,
} from "@mota/db";
import type { RepeatingScheduler } from "../app.tokens";
import {
	isSubwayPositionQuotaError,
	type SubwayPositionResult,
} from "../upstream/subwayPositions";
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
	readonly scheduleExpiration?: ExpirationScheduler;
	readonly requestBudget?: SubwayRequestBudget;
	readonly scopeHash?: string;
	readonly now?: () => number;
}

type SnapshotListener = (snapshot: SubwayPositionSnapshot) => void;
type ExpirationScheduler = (
	delayMs: number,
	task: () => void,
) => () => void;

const MAX_SUBWAY_OBSERVATION_AGE_MS = 90_000;
const NO_SUBWAY_CAPTURED_AT = "1970-01-01T00:00:00.000Z";
export const SUBWAY_POSITION_REQUEST_INTERVAL_MS =
	SUBWAY_POSITION_MIN_INTERVAL_MS;

/** Seoul documents a daily request cap, but not a reset instant. Wait a full
 * day before probing again rather than assuming a calendar-midnight reset. */
export const SUBWAY_POSITION_QUOTA_REPROBE_DELAY_MS = 24 * 60 * 60 * 1_000;

export class SubwayPositionCollector {
	private readonly listeners = new Set<SnapshotListener>();
	private readonly now: () => number;
	private readonly metrics: LiveSourceMetrics;
	private readonly scheduleExpiration: ExpirationScheduler;
	private current: SubwayPositionSnapshot;
	private inFlight: Promise<void> | null = null;
	private stopSchedule: (() => void) | null = null;
	private stopExpiration: (() => void) | null = null;
	private quotaBlockedUntil: number | null = null;
	private nextLineIndex = 0;

	constructor(private readonly options: SubwayPositionCollectorOptions) {
		this.now = options.now ?? Date.now;
		this.scheduleExpiration =
			options.scheduleExpiration ?? defaultExpirationScheduler;
		this.metrics = new LiveSourceMetrics(this.now);
		this.current = freezeSnapshot({
			availability: "unavailable",
			vehicles: [],
			capturedAt: NO_SUBWAY_CAPTURED_AT,
		});
	}

	subscribe(listener: SnapshotListener): () => void {
		this.expireStaleObservations();
		this.listeners.add(listener);
		listener(this.current);
		if (this.listeners.size === 1) {
			this.stopSchedule = this.options.scheduler.every(
				SUBWAY_POSITION_REQUEST_INTERVAL_MS,
				() => this.poll(),
			);
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
				this.stopExpiration?.();
				this.stopExpiration = null;
			}
		};
	}

	snapshot(): SubwayPositionSnapshot {
		this.expireStaleObservations();
		return this.current;
	}

	status(): TransitMapHealth["subway"] {
		this.expireStaleObservations();
		return this.metrics.snapshot(this.current.availability);
	}

	poll(): Promise<void> {
		if (this.quotaBlockedUntil !== null) {
			if (this.now() < this.quotaBlockedUntil) return Promise.resolve();
			this.quotaBlockedUntil = null;
		}
		this.inFlight ??= this.collect().finally(() => {
			this.inFlight = null;
		});
		return this.inFlight;
	}

	private hasPersistentBudget() {
		return Boolean(this.options.requestBudget && this.options.scopeHash);
	}

	private async collect() {
		if (this.hasPersistentBudget()) {
			await this.collectFairTurn();
			return;
		}
		await this.collectLocalTurn();
	}

	private async collectLocalTurn() {
		const startedAt = this.now();
		const line = this.nextLocalLine();
		if (line === undefined) {
			this.markUnavailable();
			this.metrics.recordFailure(this.now() - startedAt);
			this.publish();
			return;
		}
		const settled = await Promise.allSettled([
			Promise.resolve().then(() => this.options.loadLine(line)),
		]);
		const [result] = settled;
		const now = this.now();
		if (result?.status === "rejected") {
			if (isSubwayPositionQuotaError(result.reason)) {
				this.quotaBlockedUntil =
					now + SUBWAY_POSITION_QUOTA_REPROBE_DELAY_MS;
			}
			this.markUnavailable();
			this.metrics.recordFailure(this.now() - startedAt);
		} else if (result?.status === "fulfilled") {
			const vehicles = result.value.vehicles.filter((vehicle) =>
				isFreshObservation(vehicle.capturedAt, now),
			);
			this.current = freezeSnapshot({
				availability:
					vehicles.length > 0
						? "live"
						: result.value.availability === "live"
							? "unavailable"
							: "no-service",
				vehicles,
				capturedAt: latestCapture(vehicles, result.value.capturedAt),
			});
			this.scheduleExpirationTimer();
			this.metrics.recordSuccess(this.now() - startedAt);
		} else {
			this.markUnavailable();
			this.metrics.recordFailure(this.now() - startedAt);
		}
		this.publish();
	}

	private nextLocalLine() {
		const line = this.options.lines[this.nextLineIndex];
		if (line !== undefined) {
			this.nextLineIndex = (this.nextLineIndex + 1) % this.options.lines.length;
		}
		return line;
	}

	private async collectFairTurn() {
		const startedAt = this.now();
		const budget = this.options.requestBudget;
		const scopeHash = this.options.scopeHash;
		if (!budget || !scopeHash) return;

		try {
			const decision = await budget.reservePosition(
				scopeHash,
				this.options.lines,
				this.now(),
			);
			if (!decision.allowed) {
				if (decision.retryAt !== null && decision.retryAt > this.now()) {
					this.quotaBlockedUntil = decision.retryAt;
				}
				this.markUnavailable();
				this.metrics.recordFailure(this.now() - startedAt);
				this.publish();
				return;
			}
			const line = decision.line;
			if (line === undefined) {
				throw new Error("Subway position budget allowed no line.");
			}
			const result = await this.options.loadLine(line);
			const now = this.now();
			const vehicles = result.vehicles.filter((vehicle) =>
				isFreshObservation(vehicle.capturedAt, now),
			);
			this.current = freezeSnapshot({
				availability:
					vehicles.length > 0
						? "live"
						: result.availability === "live"
							? "unavailable"
							: "no-service",
				vehicles,
				capturedAt: latestCapture(vehicles, result.capturedAt),
			});
			this.scheduleExpirationTimer();
			this.metrics.recordSuccess(this.now() - startedAt);
		} catch (error) {
			const now = this.now();
			if (isSubwayPositionQuotaError(error)) {
				this.quotaBlockedUntil =
					now + SUBWAY_POSITION_QUOTA_REPROBE_DELAY_MS;
				try {
					await budget.markQuotaExhausted(scopeHash, now);
				} catch (persistenceError) {
					console.error(
						"Failed to persist Seoul subway quota cooldown.",
						persistenceError,
					);
				}
			}
			this.markUnavailable();
			this.metrics.recordFailure(this.now() - startedAt);
		}
		this.publish();
	}

	private markUnavailable() {
		this.stopExpiration?.();
		this.stopExpiration = null;
		this.current = freezeSnapshot({
			availability: "unavailable",
			vehicles: [],
			capturedAt: this.current.capturedAt,
		});
	}

	private expireStaleObservations() {
		const now = this.now();
		const vehicles = this.current.vehicles.filter((vehicle) =>
			isFreshObservation(vehicle.capturedAt, now),
		);
		if (vehicles.length === this.current.vehicles.length) {
			this.scheduleExpirationTimer();
			return;
		}
		this.current = freezeSnapshot({
			availability: vehicles.length > 0 ? "live" : "unavailable",
			vehicles,
			capturedAt: latestCapture(vehicles, this.current.capturedAt),
		});
		this.scheduleExpirationTimer();
		if (this.listeners.size > 0) this.publish();
	}

	private scheduleExpirationTimer() {
		this.stopExpiration?.();
		this.stopExpiration = null;
		if (this.listeners.size === 0 || this.current.vehicles.length === 0) {
			return;
		}
		const earliestCapture = this.current.vehicles.reduce(
			(earliest, vehicle) => {
				const capturedAt = Date.parse(vehicle.capturedAt);
				return Number.isFinite(capturedAt)
					? Math.min(earliest, capturedAt)
					: earliest;
			},
			Number.POSITIVE_INFINITY,
		);
		if (!Number.isFinite(earliestCapture)) return;
		const delayMs = Math.max(
			1,
			earliestCapture + MAX_SUBWAY_OBSERVATION_AGE_MS - this.now(),
		);
		this.stopExpiration = this.scheduleExpiration(delayMs, () => {
			this.stopExpiration = null;
			this.expireStaleObservations();
		});
	}

	private publish() {
		for (const listener of this.listeners) listener(this.current);
	}
}

function isFreshObservation(capturedAt: string, now: number) {
	const capturedAtMs = Date.parse(capturedAt);
	return Number.isFinite(capturedAtMs) && now - capturedAtMs <= MAX_SUBWAY_OBSERVATION_AGE_MS;
}

function latestCapture(
	vehicles: readonly SubwayVehicle[],
	fallback: number | string,
) {
	const latest = vehicles.reduce(
		(latest, vehicle) =>
			vehicle.capturedAt > latest ? vehicle.capturedAt : latest,
		"",
	);
	return latest ||
		(typeof fallback === "number" ? new Date(fallback).toISOString() : fallback);
}

function defaultExpirationScheduler(
	delayMs: number,
	task: () => void,
): () => void {
	const timer = setTimeout(task, delayMs);
	timer.unref?.();
	return () => clearTimeout(timer);
}

function freezeSnapshot(snapshot: SubwayPositionSnapshot): SubwayPositionSnapshot {
	return Object.freeze({
		...snapshot,
		vehicles: Object.freeze([...snapshot.vehicles]),
	});
}
