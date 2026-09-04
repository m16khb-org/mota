import { useEffect, useMemo, useReducer } from "react";
import type {
	TransitAvailability,
	TransitMapEvent,
	TransitMapNetwork,
	TransitVehicle,
} from "@mota/contracts/transit-map";
import {
	fetchTransitMapNetwork,
	openTransitMapEvents,
	type MapViewport,
	type TransitMapEventHandlers,
} from "../../api/transitMapClient";

export interface LiveTransitMapDependencies {
	readonly fetchNetwork: (
		viewport: MapViewport,
		signal: AbortSignal,
	) => Promise<TransitMapNetwork>;
	readonly openEvents: (
		viewport: MapViewport,
		handlers: TransitMapEventHandlers,
	) => { close(): void };
}

export interface LiveTransitMapState {
	readonly loading: boolean;
	readonly network: TransitMapNetwork | null;
	readonly availability: {
		readonly bus: TransitAvailability;
		readonly subway: TransitAvailability;
	};
	readonly vehicles: {
		readonly bus: readonly TransitVehicle[];
		readonly subway: readonly TransitVehicle[];
	};
	readonly connection: "loading" | "connecting" | "live" | "reconnecting" | "error";
	readonly lastServerTime: string | null;
	readonly error: unknown;
}

type Action =
	| { readonly type: "reset" }
	| { readonly type: "network"; readonly network: TransitMapNetwork }
	| { readonly type: "event"; readonly event: TransitMapEvent }
	| { readonly type: "connection-error"; readonly error?: unknown }
	| { readonly type: "load-error"; readonly error: unknown };

const initialState: LiveTransitMapState = {
	loading: true,
	network: null,
	availability: { bus: "unavailable", subway: "unavailable" },
	vehicles: { bus: [], subway: [] },
	connection: "loading",
	lastServerTime: null,
	error: null,
};

const defaultDependencies: LiveTransitMapDependencies = {
	fetchNetwork: fetchTransitMapNetwork,
	openEvents: openTransitMapEvents,
};

export function useLiveTransitMap(
	viewport: MapViewport,
	dependencies: LiveTransitMapDependencies = defaultDependencies,
): LiveTransitMapState {
	const normalizedViewport = useMemo(
		() => ({
			west: Number(viewport.west.toFixed(6)),
			south: Number(viewport.south.toFixed(6)),
			east: Number(viewport.east.toFixed(6)),
			north: Number(viewport.north.toFixed(6)),
			zoom: Number(viewport.zoom.toFixed(6)),
		}),
		[viewport.west, viewport.south, viewport.east, viewport.north, viewport.zoom],
	);
	const [state, dispatch] = useReducer(reducer, initialState);

	useEffect(() => {
		const abortController = new AbortController();
		let connection: { close(): void } | null = null;
		let active = true;
		dispatch({ type: "reset" });
		void dependencies
			.fetchNetwork(normalizedViewport, abortController.signal)
			.then((network) => {
				if (!active) return;
				dispatch({ type: "network", network });
				connection = dependencies.openEvents(normalizedViewport, {
					onEvent: (event) => dispatch({ type: "event", event }),
					onConnectionError: () => dispatch({ type: "connection-error" }),
					onProtocolError: (error) =>
						dispatch({ type: "connection-error", error }),
				});
			})
			.catch((error) => {
				if (active && !abortController.signal.aborted) {
					dispatch({ type: "load-error", error });
				}
			});
		return () => {
			active = false;
			abortController.abort();
			connection?.close();
		};
	}, [dependencies, normalizedViewport]);

	return state;
}

function reducer(
	state: LiveTransitMapState,
	action: Action,
): LiveTransitMapState {
	switch (action.type) {
		case "reset":
			return initialState;
		case "network":
			return {
				...state,
				loading: false,
				network: action.network,
				connection: "connecting",
				error: null,
			};
		case "connection-error":
			return {
				...state,
				connection: "reconnecting",
				vehicles: { bus: [], subway: [] },
				error: action.error ?? state.error,
			};
		case "load-error":
			return {
				...state,
				loading: false,
				connection: "error",
				vehicles: { bus: [], subway: [] },
				error: action.error,
			};
		case "event":
			return reduceEvent(state, action.event);
	}
}

function reduceEvent(
	state: LiveTransitMapState,
	event: TransitMapEvent,
): LiveTransitMapState {
	switch (event.kind) {
		case "ready":
			return {
				...state,
				connection: "live",
				lastServerTime: event.serverTime,
				error: null,
			};
		case "heartbeat":
			return { ...state, lastServerTime: event.serverTime };
		case "vehicles":
			return {
				...state,
				vehicles: { bus: event.bus, subway: event.subway },
				lastServerTime: event.capturedAt,
			};
		case "availability":
			return {
				...state,
				availability: { bus: event.bus, subway: event.subway },
				vehicles: {
					bus: event.bus === "live" ? state.vehicles.bus : [],
					subway: event.subway === "live" ? state.vehicles.subway : [],
				},
				lastServerTime: event.observedAt,
			};
	}
}
