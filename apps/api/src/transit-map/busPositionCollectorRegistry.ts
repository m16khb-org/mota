import type {
	TransitAvailability,
	TransitMapHealth,
	TransitVehicle,
} from "@mota/contracts/transit-map";
import type { RepeatingScheduler } from "../app.tokens";
import type { BusPositionResult } from "../upstream/seoulBusPositions";
import { LiveSourceMetrics } from "./liveSourceMetrics";
import type {
	BusPositionSnapshot,
	BusPositionSource,
} from "./transitMapStream.service";

export type BusRegistrySnapshot = BusPositionSnapshot;

interface RegistryOptions {
	readonly loadRoute: (routeId: string) => Promise<BusPositionResult>;
	readonly scheduler: RepeatingScheduler;
	readonly now?: () => number;
}

interface RouteCollector {
	readonly routeId: string;
	refs: number;
	snapshot: BusRegistrySnapshot | null;
	inFlight: Promise<void> | null;
	stop: () => void;
}

interface RegistrySubscriber {
	readonly routeIds: readonly string[];
	readonly listener: (snapshot: BusRegistrySnapshot) => void;
}

export class BusPositionCollectorRegistry implements BusPositionSource {
	private readonly collectors = new Map<string, RouteCollector>();
	private readonly subscribers = new Set<RegistrySubscriber>();
	private readonly now: () => number;
	private readonly metrics: LiveSourceMetrics;

	constructor(private readonly options: RegistryOptions) {
		this.now = options.now ?? Date.now;
		this.metrics = new LiveSourceMetrics(this.now);
	}

	acquire(
		routeIds: readonly string[],
		listener: (snapshot: BusRegistrySnapshot) => void,
	): () => void {
		const uniqueRouteIds = [...new Set(routeIds)].sort();
		const subscriber = { routeIds: uniqueRouteIds, listener };
		this.subscribers.add(subscriber);
		for (const routeId of uniqueRouteIds) {
			let collector = this.collectors.get(routeId);
			if (!collector) {
				collector = this.createCollector(routeId);
				this.collectors.set(routeId, collector);
				void this.poll(collector);
			}
			collector.refs += 1;
		}
		listener(this.aggregate(uniqueRouteIds));
		let active = true;
		return () => {
			if (!active) return;
			active = false;
			this.subscribers.delete(subscriber);
			for (const routeId of uniqueRouteIds) {
				const collector = this.collectors.get(routeId);
				if (!collector) continue;
				collector.refs -= 1;
				if (collector.refs === 0) {
					collector.stop();
					this.collectors.delete(routeId);
				}
			}
		};
	}

	collectorCount() {
		return this.collectors.size;
	}

	status(): TransitMapHealth["bus"] {
		const snapshots = [...this.collectors.values()].map(
			(collector) => collector.snapshot,
		);
		let status: TransitAvailability = "no-service";
		if (snapshots.some((snapshot) => snapshot === null)) status = "unavailable";
		else if (snapshots.some((snapshot) => snapshot?.availability === "live")) {
			status = "live";
		}
		return this.metrics.snapshot(status);
	}

	private createCollector(routeId: string): RouteCollector {
		const collector: RouteCollector = {
			routeId,
			refs: 0,
			snapshot: null,
			inFlight: null,
			stop: () => undefined,
		};
		collector.stop = this.options.scheduler.every(15_000, () =>
			this.poll(collector),
		);
		return collector;
	}

	private poll(collector: RouteCollector): Promise<void> {
		collector.inFlight ??= this.collect(collector).finally(() => {
			collector.inFlight = null;
		});
		return collector.inFlight;
	}

	private async collect(collector: RouteCollector) {
		const startedAt = this.now();
		try {
			collector.snapshot = await this.options.loadRoute(collector.routeId);
			this.metrics.recordSuccess(this.now() - startedAt);
		} catch {
			collector.snapshot = {
				availability: "unavailable",
				vehicles: [],
				capturedAt: new Date(this.now()).toISOString(),
			};
			this.metrics.recordFailure(this.now() - startedAt);
		}
		for (const subscriber of this.subscribers) {
			if (subscriber.routeIds.includes(collector.routeId)) {
				subscriber.listener(this.aggregate(subscriber.routeIds));
			}
		}
	}

	private aggregate(routeIds: readonly string[]): BusRegistrySnapshot {
		if (routeIds.length === 0) {
			return freezeSnapshot("no-service", [], new Date(this.now()).toISOString());
		}
		const snapshots = routeIds.map(
			(routeId) => this.collectors.get(routeId)?.snapshot ?? null,
		);
		if (
			snapshots.some(
				(snapshot) => snapshot === null || snapshot.availability === "unavailable",
			)
		) {
			return freezeSnapshot(
				"unavailable",
				[],
				new Date(this.now()).toISOString(),
			);
		}
		const complete = snapshots.filter(
			(snapshot): snapshot is BusRegistrySnapshot => snapshot !== null,
		);
		const vehicles = complete.flatMap((snapshot) => snapshot.vehicles);
		const capturedAt = complete.reduce(
			(latest, snapshot) =>
				snapshot.capturedAt > latest ? snapshot.capturedAt : latest,
			"",
		);
		return freezeSnapshot(
			vehicles.length > 0 ? "live" : "no-service",
			vehicles,
			capturedAt || new Date(this.now()).toISOString(),
		);
	}
}

function freezeSnapshot(
	availability: TransitAvailability,
	vehicles: readonly TransitVehicle[],
	capturedAt: string,
): BusRegistrySnapshot {
	return Object.freeze({
		availability,
		vehicles: Object.freeze([...vehicles]),
		capturedAt,
	});
}
