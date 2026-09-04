import type { MessageEvent } from "@nestjs/common";
import {
	transitMapEventSchema,
	type TransitAvailability,
	type TransitMapQuery,
	type TransitVehicle,
} from "@mota/contracts/transit-map";
import { Observable } from "rxjs";
import type { RepeatingScheduler } from "../app.tokens";
import type { SubwayPositionSnapshot } from "./subwayPositionCollector";
import type { TransitMapNetworkService } from "./transitMapNetwork.service";

export interface BusPositionSnapshot {
	readonly availability: TransitAvailability;
	readonly vehicles: readonly TransitVehicle[];
	readonly capturedAt: string;
}

export interface BusPositionSource {
	acquire(
		routeIds: readonly string[],
		listener: (snapshot: BusPositionSnapshot) => void,
	): () => void;
	status?(): import("@mota/contracts/transit-map").TransitMapHealth["bus"];
}

export interface SubwayPositionSource {
	snapshot(): SubwayPositionSnapshot;
	subscribe(listener: (snapshot: SubwayPositionSnapshot) => void): () => void;
}

let eventSequence = 0;

export const BUS_POSITION_SOURCE = Symbol("BUS_POSITION_SOURCE");

export class EmptyBusPositionSource implements BusPositionSource {
	acquire(
		_routeIds: readonly string[],
		listener: (snapshot: BusPositionSnapshot) => void,
	) {
		listener({
			availability: "unavailable",
			vehicles: [],
			capturedAt: new Date().toISOString(),
		});
		return () => undefined;
	}

	status(): import("@mota/contracts/transit-map").TransitMapHealth["bus"] {
		return {
			status: "unconfigured",
			successCount: 0,
			failureCount: 0,
			consecutiveFailures: 0,
			lastSuccessAt: null,
			lastFailureAt: null,
			lastDurationMs: null,
		};
	}
}

export class TransitMapStreamService {
	constructor(
		private readonly networks: Pick<TransitMapNetworkService, "network">,
		private readonly subway: SubwayPositionSource,
		private readonly bus: BusPositionSource,
		private readonly scheduler: RepeatingScheduler,
		private readonly now: () => number = Date.now,
	) {}

	events(query: TransitMapQuery): Observable<MessageEvent> {
		return new Observable<MessageEvent>((subscriber) => {
			let closed = false;
			let initialized = false;
			let subwaySnapshot = this.subway.snapshot();
			let busSnapshot: BusPositionSnapshot = {
				availability: "unavailable",
				vehicles: [],
				capturedAt: new Date(this.now()).toISOString(),
			};
			let stopSubway: (() => void) | null = null;
			let stopBus: (() => void) | null = null;
			let stopHeartbeat: (() => void) | null = null;

			const emit = (event: unknown) => {
				if (closed) return;
				const parsed = transitMapEventSchema.parse(event);
				eventSequence += 1;
				subscriber.next({
					id: String(eventSequence),
					type: parsed.kind,
					data: parsed,
				});
			};
			const emitSnapshots = () => {
				emit({
					kind: "availability",
					bus: busSnapshot.availability,
					subway: subwaySnapshot.availability,
					observedAt: new Date(this.now()).toISOString(),
				});
				emit({
					kind: "vehicles",
					bus: busSnapshot.vehicles,
					subway: subwaySnapshot.vehicles,
					capturedAt: latestTimestamp(
						busSnapshot.capturedAt,
						subwaySnapshot.capturedAt,
					),
				});
			};

			void this.networks
				.network(query)
				.then((network) => {
					if (closed) return;
					emit({
						kind: "ready",
						revision: network.revision,
						modes: network.bus.enabled ? ["bus", "subway"] : ["subway"],
						serverTime: new Date(this.now()).toISOString(),
					});
					busSnapshot = {
						availability: network.bus.enabled
							? "unavailable"
							: (network.bus.reason ?? "unavailable"),
						vehicles: [],
						capturedAt: new Date(this.now()).toISOString(),
					};
					stopSubway = this.subway.subscribe((snapshot) => {
						subwaySnapshot = snapshot;
						if (initialized) emitSnapshots();
					});
					if (network.bus.enabled) {
						const routeIds = network.bus.routes.features.map(
							(feature) => feature.properties.routeId,
						);
						stopBus = this.bus.acquire(routeIds, (snapshot) => {
							busSnapshot = {
								...snapshot,
								vehicles: snapshot.vehicles.filter((vehicle) =>
									vehicleInside(vehicle, query),
								),
							};
							if (initialized) emitSnapshots();
						});
					}
					initialized = true;
					emitSnapshots();
					stopHeartbeat = this.scheduler.every(15_000, async () => {
						emit({
							kind: "heartbeat",
							serverTime: new Date(this.now()).toISOString(),
						});
					});
				})
				.catch((error) => {
					if (!closed) subscriber.error(error);
				});

			return () => {
				closed = true;
				stopHeartbeat?.();
				stopBus?.();
				stopSubway?.();
			};
		});
	}
}

function latestTimestamp(left: string, right: string) {
	return left > right ? left : right;
}

function vehicleInside(vehicle: TransitVehicle, query: TransitMapQuery) {
	const [longitude, latitude] = vehicle.coordinates;
	return (
		longitude >= query.west &&
		longitude <= query.east &&
		latitude >= query.south &&
		latitude <= query.north
	);
}
