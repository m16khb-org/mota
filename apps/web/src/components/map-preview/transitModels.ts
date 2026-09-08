import type {
	SubwayVehicle,
	TransitMapNetwork,
} from "@mota/contracts/transit-map";
import {
	compileRoutes,
	offsetCoordinate,
	projectOnPath,
	routeKey,
	type Coordinate,
	type RouteCollection,
} from "./transitGeometry";

interface Part {
	readonly name: string;
	readonly width: number;
	readonly length: number;
	readonly base: number;
	readonly height: number;
	readonly color: string;
	readonly right?: number;
	readonly forward?: number;
}

// Deliberately legible schematic dimensions, not surveyed building footprints.
const STATION: readonly Part[] = [
	{ name: "platform", width: 22, length: 44, base: 0, height: 1, color: "#62625d" },
	{ name: "hall", width: 16, length: 32, base: 1, height: 7, color: "#f7f7f3" },
	{ name: "roof", width: 20, length: 38, base: 7, height: 8.5, color: "#c7f000" },
	{ name: "entrance", width: 8, length: 4, base: 1, height: 5, color: "#0b0b0b", forward: 17 },
	{ name: "sign", width: 9, length: 2, base: 8.5, height: 11, color: "#0b0b0b", forward: 10 },
];

const EMPTY_ROUTES: RouteCollection = {
	type: "FeatureCollection",
	features: [],
};

const FALLBACK_ROUTE_COLOR = "#7d7d76";

const TRAIN_CARS = [-10.2, 0, 10.2] as const;
// Car side stack: chassis 0.25-1.0, body 1.0-1.6, route-colored livery belt
// 1.5-2.7 (protrudes past body, windows and doors), window band 2.7-3.5, roof
// slab 3.5-4.4, roof equipment 4.4-5.4, pantograph up to 7. The livery belt is
// the widest, boldest band so the authoritative line color stays readable
// across the model LOD zooms instead of antialiasing into the body.
const TRAIN_PARTS: readonly Part[] = [
	{ name: "chassis", width: 3.6, length: 31, base: 0.25, height: 1, color: "#0b0b0b" },
	...TRAIN_CARS.flatMap((forward, index) => [
		{
			name: `car-${index + 1}-body`,
			width: 3.4,
			length: 9.3,
			base: 1,
			height: 1.6,
			color: "#f7f7f3",
			forward,
		},
		{
			name: `car-${index + 1}-stripe`,
			width: 3.62,
			length: 9,
			base: 1.5,
			height: 2.7,
			color: "#e6186c",
			forward,
		},
		{
			name: `car-${index + 1}-window-band`,
			width: 3.45,
			length: 7.2,
			base: 2.7,
			height: 3.5,
			color: "#0b0b0b",
			forward,
		},
		{
			name: `car-${index + 1}-door-front`,
			width: 3.6,
			length: 0.45,
			base: 1.3,
			height: 3.3,
			color: "#62625d",
			forward: forward + 3.45,
		},
		{
			name: `car-${index + 1}-door-rear`,
			width: 3.6,
			length: 0.45,
			base: 1.3,
			height: 3.3,
			color: "#62625d",
			forward: forward - 3.45,
		},
	]),
	{ name: "car-divider-front", width: 3.55, length: 0.25, base: 0.9, height: 3.5, color: "#0b0b0b", forward: -5.1 },
	{ name: "car-divider-rear", width: 3.55, length: 0.25, base: 0.9, height: 3.5, color: "#0b0b0b", forward: 5.1 },
	{ name: "front-cab", width: 3.45, length: 0.9, base: 1, height: 3.4, color: "#f7f7f3", forward: 15.05 },
	{ name: "front-windshield", width: 3.1, length: 0.4, base: 2.3, height: 3.6, color: "#0b0b0b", forward: 15.4 },
	{ name: "rear-cab", width: 3.45, length: 0.9, base: 1, height: 3.4, color: "#f7f7f3", forward: -15.05 },
	{ name: "rear-windshield", width: 3.1, length: 0.4, base: 2.3, height: 3.6, color: "#0b0b0b", forward: -15.4 },
	{ name: "roof-equipment-front", width: 1.3, length: 1.4, base: 4.4, height: 5.4, color: "#62625d", forward: 7.5 },
	{ name: "roof-equipment-center", width: 1.3, length: 1.4, base: 4.4, height: 5.4, color: "#62625d" },
	{ name: "roof-equipment-rear", width: 1.3, length: 1.4, base: 4.4, height: 5.4, color: "#62625d", forward: -7.5 },
	{ name: "pantograph", width: 1.2, length: 3, base: 5.4, height: 7, color: "#0b0b0b" },
	{ name: "roof-front", width: 3.5, length: 9.4, base: 3.5, height: 4.4, color: "#c7f000", forward: 10.2 },
	{ name: "roof-center", width: 3.5, length: 9.4, base: 3.5, height: 4.4, color: "#c7f000" },
	{ name: "roof-rear", width: 3.5, length: 9.4, base: 3.5, height: 4.4, color: "#c7f000", forward: -10.2 },
];

function model(
	center: Coordinate,
	heading: number,
	properties: Record<string, unknown>,
	parts: readonly Part[],
) {
	return parts.map((part) => {
		const corners = [
			[-1, -1],
			[1, -1],
			[1, 1],
			[-1, 1],
			[-1, -1],
		] as const;
		return {
			type: "Feature" as const,
			properties: {
				...properties,
				anchorLng: center[0],
				anchorLat: center[1],
				part: part.name,
				base: part.base,
				height: part.height,
				color: part.color,
			},
			geometry: {
				type: "Polygon" as const,
				coordinates: [
					corners.map(([x, y]) =>
						offsetCoordinate(
							center,
							(x * part.width) / 2 + (part.right ?? 0),
							(y * part.length) / 2 + (part.forward ?? 0),
							heading,
						),
					),
				],
			},
		};
	});
}

function routeColor(vehicle: SubwayVehicle, routes: RouteCollection) {
	const keys = new Set([routeKey(vehicle.routeId), routeKey(vehicle.routeName)]);
	const route = routes.features.find(
		(feature) =>
			keys.has(routeKey(feature.properties.routeId)) ||
			keys.has(routeKey(feature.properties.routeName)),
	);
	return route?.properties.color ?? FALLBACK_ROUTE_COLOR;
}

export function staticModels(
	features: TransitMapNetwork["subway"]["stations"]["features"],
	routes: RouteCollection,
) {
	const paths = compileRoutes(routes);
	return {
		type: "FeatureCollection" as const,
		features: features.flatMap((feature) => {
			const keys = feature.properties.routeIds.map(routeKey);
			let nearest = { distance: Number.POSITIVE_INFINITY, bearing: 0 };
			for (const path of paths) {
				if (!path.keys.some((key) => keys.includes(key))) continue;
				const candidate = projectOnPath(feature.geometry.coordinates, path);
				if (candidate.distance < nearest.distance) nearest = candidate;
			}
			return model(
				feature.geometry.coordinates,
				nearest.distance < 400 ? nearest.bearing : 0,
				feature.properties,
				STATION,
			);
		}),
	};
}

export function vehiclePoints(
	vehicles: readonly SubwayVehicle[],
	routes: RouteCollection = EMPTY_ROUTES,
) {
	return {
		type: "FeatureCollection" as const,
		features: vehicles.map(({ coordinates, ...properties }) => ({
			type: "Feature" as const,
			properties: {
				...properties,
				color: routeColor({ ...properties, coordinates } as SubwayVehicle, routes),
				anchorLng: coordinates[0],
				anchorLat: coordinates[1],
			},
			geometry: { type: "Point" as const, coordinates },
		})),
	};
}

export function vehicleModels(
	vehicles: readonly SubwayVehicle[],
	routes: RouteCollection = EMPTY_ROUTES,
) {
	return {
		type: "FeatureCollection" as const,
		features: vehicles.flatMap((vehicle) =>
			model(
				vehicle.coordinates,
				vehicle.bearing,
				{ ...vehicle, color: routeColor(vehicle, routes) },
				TRAIN_PARTS.map((part) =>
					part.name.endsWith("-stripe") ? { ...part, color: routeColor(vehicle, routes) } : part,
				),
			),
		),
	};
}
