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
	readonly bevel?: number;
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

const TRAIN_CARS = [-10.1, 0, 10.1] as const;
// The train keeps a coherent miniature scale: a 31m underframe, three 9.6m
// cars, and a 3.0m body width. The stack is intentionally quiet and layered:
// pale lower body, strong but finite route band, charcoal glazing, silver roof,
// and small roof equipment. The 31m envelope stays aligned with the zoom-16 LOD
// handoff; the bevels are geometry, not a texture or an extra rendering engine.
const TRAIN_PARTS: readonly Part[] = [
	{ name: "chassis", width: 3.2, length: 31, base: 0.25, height: 0.68, color: "#263139" },
	...TRAIN_CARS.flatMap((forward, index) => [
		{
			name: `car-${index + 1}-body`,
			width: 3,
			length: 9.6,
			base: 0.65,
			height: 2.65,
			color: "#d4dad8",
			forward,
			bevel: 0.12,
		},
		{
			name: `car-${index + 1}-stripe`,
			width: 3.1,
			length: 9.35,
			base: 1.36,
			height: 2.08,
			color: "#e6186c",
			forward,
			bevel: 0.1,
		},
		{
			name: `car-${index + 1}-window-band`,
			width: 2.84,
			length: 7.7,
			base: 1.98,
			height: 2.65,
			color: "#19252d",
			forward,
			bevel: 0.08,
		},
		{
			name: `car-${index + 1}-door-front`,
			width: 3.05,
			length: 0.48,
			base: 0.74,
			height: 2.46,
			color: "#667378",
			forward: forward + 3.5,
		},
		{
			name: `car-${index + 1}-door-rear`,
			width: 3.05,
			length: 0.48,
			base: 0.74,
			height: 2.46,
			color: "#667378",
			forward: forward - 3.5,
		},
	]),
	// These narrow dark blocks bridge the 0.5m inter-car gaps without turning
	// them into a solid divider, so the three-car identity survives at close zoom.
	{ name: "car-divider-front", width: 1.05, length: 0.72, base: 0.43, height: 1.1, color: "#111a20", forward: -5.1 },
	{ name: "car-divider-rear", width: 1.05, length: 0.72, base: 0.43, height: 1.1, color: "#111a20", forward: 5.1 },
	{ name: "front-cab", width: 3.05, length: 1.25, base: 0.65, height: 2.78, color: "#e5e9e6", forward: 15, bevel: 0.32 },
	{ name: "front-windshield", width: 2.55, length: 0.34, base: 1.93, height: 2.58, color: "#111c24", forward: 15.5, bevel: 0.13 },
	{ name: "rear-cab", width: 3.05, length: 1.25, base: 0.65, height: 2.78, color: "#e5e9e6", forward: -15, bevel: 0.32 },
	{ name: "rear-windshield", width: 2.55, length: 0.34, base: 1.93, height: 2.58, color: "#111c24", forward: -15.5, bevel: 0.13 },
	{ name: "roof-equipment-front", width: 0.85, length: 1.45, base: 3.05, height: 3.34, color: "#778486", forward: 6.8 },
	{ name: "roof-equipment-center", width: 0.85, length: 1.45, base: 3.05, height: 3.34, color: "#778486" },
	{ name: "roof-equipment-rear", width: 0.85, length: 1.45, base: 3.05, height: 3.34, color: "#778486", forward: -6.8 },
	{ name: "pantograph", width: 0.85, length: 2.7, base: 3.34, height: 4.05, color: "#263139" },
	{ name: "roof-front", width: 3.04, length: 9.6, base: 2.55, height: 3.05, color: "#eef1ee", forward: 10.1, bevel: 0.14 },
	{ name: "roof-center", width: 3.04, length: 9.6, base: 2.55, height: 3.05, color: "#eef1ee", bevel: 0.14 },
	{ name: "roof-rear", width: 3.04, length: 9.6, base: 2.55, height: 3.05, color: "#eef1ee", forward: -10.1, bevel: 0.14 },
];

function localFootprint(part: Part): readonly (readonly [number, number])[] {
	const halfWidth = part.width / 2;
	const halfLength = part.length / 2;
	const bevel = Math.min(part.bevel ?? 0, halfWidth * 0.45, halfLength * 0.45);
	if (!bevel) {
		return [
			[-halfWidth, -halfLength],
			[halfWidth, -halfLength],
			[halfWidth, halfLength],
			[-halfWidth, halfLength],
			[-halfWidth, -halfLength],
		];
	}
	return [
		[-halfWidth + bevel, -halfLength],
		[halfWidth - bevel, -halfLength],
		[halfWidth, -halfLength + bevel],
		[halfWidth, halfLength - bevel],
		[halfWidth - bevel, halfLength],
		[-halfWidth + bevel, halfLength],
		[-halfWidth, halfLength - bevel],
		[-halfWidth, -halfLength + bevel],
		[-halfWidth + bevel, -halfLength],
	];
}

function model(
	center: Coordinate,
	heading: number,
	properties: Record<string, unknown>,
	parts: readonly Part[],
) {
	return parts.map((part) => {
		const corners = localFootprint(part);
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
							x + (part.right ?? 0),
							y + (part.forward ?? 0),
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
