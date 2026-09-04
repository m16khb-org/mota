import {
	transitMapEventSchema,
	transitMapNetworkSchema,
	type TransitMapEvent,
	type TransitMapNetwork,
} from "@mota/contracts/transit-map";

export interface MapViewport {
	readonly west: number;
	readonly south: number;
	readonly east: number;
	readonly north: number;
	readonly zoom: number;
}

export interface TransitMapEventHandlers {
	readonly onEvent: (event: TransitMapEvent) => void;
	readonly onConnectionError: () => void;
	readonly onProtocolError: (error: unknown) => void;
}

export interface EventSourceLike {
	addEventListener(type: string, listener: (event: MessageEvent) => void): void;
	close(): void;
}

type FetchLike = (
	input: string | URL | Request,
	init?: RequestInit,
) => Promise<Response>;
type EventSourceFactory = (url: string) => EventSourceLike;

export async function fetchTransitMapNetwork(
	viewport: MapViewport,
	signal: AbortSignal,
	fetcher: FetchLike = fetch,
): Promise<TransitMapNetwork> {
	const response = await fetcher(
		`/api/transit-map/network?${viewportQuery(viewport)}`,
		{ signal },
	);
	if (!response.ok) {
		throw new Error(`Transit map network request failed with ${response.status}`);
	}
	return transitMapNetworkSchema.parse(await response.json());
}

export function openTransitMapEvents(
	viewport: MapViewport,
	handlers: TransitMapEventHandlers,
	createEventSource: EventSourceFactory = (url) => new EventSource(url),
) {
	const source = createEventSource(
		`/api/transit-map/events?${viewportQuery(viewport)}`,
	);
	for (const kind of ["ready", "vehicles", "availability", "heartbeat"] as const) {
		source.addEventListener(kind, (message) => {
			try {
				handlers.onEvent(
					transitMapEventSchema.parse(JSON.parse(String(message.data))),
				);
			} catch (error) {
				handlers.onProtocolError(error);
			}
		});
	}
	source.addEventListener("error", () => handlers.onConnectionError());
	return { close: () => source.close() };
}

export function viewportQuery(viewport: MapViewport) {
	return new URLSearchParams({
		west: viewport.west.toFixed(6),
		south: viewport.south.toFixed(6),
		east: viewport.east.toFixed(6),
		north: viewport.north.toFixed(6),
		zoom: viewport.zoom.toFixed(6),
	}).toString();
}
