import { Injectable } from "@nestjs/common";
import {
	transitMapNetworkSchema,
	type TransitMapNetwork,
	type TransitMapQuery,
} from "@mota/contracts";
import {
	filterSubwayNetwork,
	subwayNetworkGeneratedAt,
	subwayNetworkRevision,
} from "./subwayNetworkSource";

// Compatibility type for the standalone bus topology adapter. The subway-only
// preview no longer injects or calls a topology port.
export interface BusRouteTopology {
	readonly routeId: string;
	readonly routeName: string;
	readonly color: string;
	readonly stopIds: readonly string[];
	readonly path: readonly (readonly [number, number])[];
}

@Injectable()
export class TransitMapNetworkService {
	async network(query: TransitMapQuery): Promise<TransitMapNetwork> {
		const queryRevision = [
			query.west,
			query.south,
			query.east,
			query.north,
			query.zoom,
		]
			.map((value) => value.toFixed(6))
			.join(":");

		return transitMapNetworkSchema.parse({
			revision: `${subwayNetworkRevision}:${queryRevision}`,
			generatedAt: subwayNetworkGeneratedAt,
			subway: filterSubwayNetwork(query),
		});
	}
}
