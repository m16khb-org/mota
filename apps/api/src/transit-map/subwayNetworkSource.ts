import {
	subwayNetworkSchema,
	type TransitMapNetwork,
	type TransitMapQuery,
} from "@mota/contracts";
import {
	SUBWAY_NETWORK,
	SUBWAY_NETWORK_GENERATED_AT,
} from "./data/subwayNetwork.generated";

type SubwayNetwork = TransitMapNetwork["subway"];
type Coordinate = readonly [number, number];

function deepFreeze<T>(value: T): T {
	if (value && typeof value === "object" && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const nested of Object.values(value)) deepFreeze(nested);
	}
	return value;
}

const network = deepFreeze(subwayNetworkSchema.parse(SUBWAY_NETWORK));

export const subwayNetworkRevision = `osm-${SUBWAY_NETWORK_GENERATED_AT}`;
export const subwayNetworkGeneratedAt = SUBWAY_NETWORK_GENERATED_AT;

export function loadSubwayNetwork(): SubwayNetwork {
	return network;
}

function pointInside([longitude, latitude]: Coordinate, query: TransitMapQuery) {
	return (
		longitude >= query.west &&
		longitude <= query.east &&
		latitude >= query.south &&
		latitude <= query.north
	);
}

function orientation(left: Coordinate, middle: Coordinate, right: Coordinate) {
	return (
		(middle[1] - left[1]) * (right[0] - middle[0]) -
		(middle[0] - left[0]) * (right[1] - middle[1])
	);
}

function segmentsIntersect(
	leftStart: Coordinate,
	leftEnd: Coordinate,
	rightStart: Coordinate,
	rightEnd: Coordinate,
) {
	const first = orientation(leftStart, leftEnd, rightStart);
	const second = orientation(leftStart, leftEnd, rightEnd);
	const third = orientation(rightStart, rightEnd, leftStart);
	const fourth = orientation(rightStart, rightEnd, leftEnd);
	return (
		((first <= 0 && second >= 0) || (first >= 0 && second <= 0)) &&
		((third <= 0 && fourth >= 0) || (third >= 0 && fourth <= 0))
	);
}

function segmentIntersectsBounds(
	start: Coordinate,
	end: Coordinate,
	query: TransitMapQuery,
) {
	if (pointInside(start, query) || pointInside(end, query)) return true;
	const southWest: Coordinate = [query.west, query.south];
	const southEast: Coordinate = [query.east, query.south];
	const northEast: Coordinate = [query.east, query.north];
	const northWest: Coordinate = [query.west, query.north];
	return (
		segmentsIntersect(start, end, southWest, southEast) ||
		segmentsIntersect(start, end, southEast, northEast) ||
		segmentsIntersect(start, end, northEast, northWest) ||
		segmentsIntersect(start, end, northWest, southWest)
	);
}

function lineIntersectsBounds(
	coordinates: readonly Coordinate[],
	query: TransitMapQuery,
) {
	for (let index = 1; index < coordinates.length; index += 1) {
		const start = coordinates[index - 1];
		const end = coordinates[index];
		if (start && end && segmentIntersectsBounds(start, end, query)) {
			return true;
		}
	}
	return false;
}

export function filterSubwayNetwork(query: TransitMapQuery): SubwayNetwork {
	const filtered = {
		attribution: network.attribution,
		lines: {
			type: "FeatureCollection" as const,
			features: network.lines.features.filter((feature) =>
				lineIntersectsBounds(feature.geometry.coordinates, query),
			),
		},
		stations: {
			type: "FeatureCollection" as const,
			features: network.stations.features.filter((feature) =>
				pointInside(feature.geometry.coordinates, query),
			),
		},
	};
	return deepFreeze(filtered);
}
