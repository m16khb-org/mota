import { writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";

const SEOUL_BOUNDS = "37.3,126.7,37.8,127.3";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const OUTPUT_URL = new URL(
	"../apps/api/src/transit-map/data/subwayNetwork.generated.ts",
	import.meta.url,
);

const ROUTE_COLORS = Object.freeze({
	"1": "#0052a4",
	"2": "#00a84d",
	"3": "#ef7c1c",
	"4": "#00a5de",
	"5": "#996cac",
	"6": "#cd7c2f",
	"7": "#747f00",
	"8": "#e6186c",
	"9": "#bdb092",
	경의중앙: "#77c4a3",
	공항철도: "#0090d2",
	경춘: "#0c8e72",
	수인분당: "#f5a200",
	신분당: "#d4003b",
});

const ROUTE_ALIASES = Object.freeze({
	"GTX-A": { routeName: "GTX-A", color: "#9a6292" },
	"경강": { routeName: "경강선", color: "#003da5" },
	"경의·중앙": { routeName: "경의중앙선", color: "#77c4a3" },
	"경춘": { routeName: "경춘선", color: "#0c8e72" },
	"공항철도": { routeName: "공항철도", color: "#0090d2" },
	"서해": { routeName: "서해선", color: "#8fc31f" },
	"수인·분당": { routeName: "수인분당선", color: "#f5a200" },
	"신분당": { routeName: "신분당선", color: "#d4003b" },
	"인천1": { routeName: "인천1호선", color: "#759cbe" },
	I2: { routeName: "인천2호선", color: "#ed8b00" },
	"김포 골드라인": { routeName: "김포골드라인", color: "#ad8605" },
	Silim: { routeName: "신림선", color: "#6789ca" },
	U: { routeName: "의정부경전철", color: "#fda600" },
	"용인": { routeName: "에버라인", color: "#6fb245" },
	W: { routeName: "우이신설선", color: "#b7c450" },
});

const coordinateSchema = z.object({
	lat: z.number().finite(),
	lon: z.number().finite(),
});
const memberSchema = z.object({
	type: z.enum(["node", "way", "relation"]),
	ref: z.number().int(),
	role: z.string().default(""),
});
const nodeSchema = z.object({
	type: z.literal("node"),
	id: z.number().int(),
	lat: z.number().finite(),
	lon: z.number().finite(),
	tags: z.record(z.string(), z.string()).default({}),
});
const waySchema = z.object({
	type: z.literal("way"),
	id: z.number().int(),
	nodes: z.array(z.number().int()).default([]),
	geometry: z.array(coordinateSchema).min(2),
	tags: z.record(z.string(), z.string()).default({}),
});
const relationSchema = z.object({
	type: z.literal("relation"),
	id: z.number().int(),
	tags: z.record(z.string(), z.string()),
	members: z.array(memberSchema),
});
const overpassSchema = z.object({
	osm3s: z
		.object({ timestamp_osm_base: z.string().optional() })
		.optional(),
	elements: z.array(z.discriminatedUnion("type", [nodeSchema, waySchema, relationSchema])),
});

function roundCoordinate(value) {
	return Number(value.toFixed(6));
}

function insideMotaBounds({ lon, lat }) {
	return lon >= 126.7 && lon <= 127.3 && lat >= 37.3 && lat <= 37.8;
}

function boundedGeometryRuns(geometry) {
	const runs = [];
	let current = [];
	for (const coordinate of geometry) {
		if (insideMotaBounds(coordinate)) {
			current.push([
				roundCoordinate(coordinate.lon),
				roundCoordinate(coordinate.lat),
			]);
			continue;
		}
		if (current.length >= 2) runs.push(current);
		current = [];
	}
	if (current.length >= 2) runs.push(current);
	return runs;
}

function distanceKm([leftLongitude, leftLatitude], [rightLongitude, rightLatitude]) {
	const midpointLatitude = ((leftLatitude + rightLatitude) / 2) * (Math.PI / 180);
	const longitudeDistance =
		(rightLongitude - leftLongitude) * (Math.PI / 180) * Math.cos(midpointLatitude);
	const latitudeDistance = (rightLatitude - leftLatitude) * (Math.PI / 180);
	return Math.hypot(longitudeDistance, latitudeDistance) * 6_371;
}

function routeIdentity(relation) {
	const ref = relation.tags.ref?.trim();
	const rawName = relation.tags.name?.trim();
	const routeId = ref || String(relation.id);
	const alias = ref ? ROUTE_ALIASES[ref] : undefined;
	if (alias) return { routeId, ...alias };
	if (!ref && rawName?.includes("의정부경전철")) {
		return { routeId: "U", ...ROUTE_ALIASES.U };
	}
	const routeName = ref
		? /^\d+$/.test(ref)
			? `${ref}호선`
			: ref.endsWith("선")
				? ref
				: `${ref}선`
		: rawName?.replace(/^서울(?:특별시)?\s*(?:도시철도|지하철)\s*/, "") ||
			`노선 ${relation.id}`;
	const colorKey = Object.keys(ROUTE_COLORS).find((key) =>
		routeName.replace(/호선$/, "").includes(key),
	);
	const taggedColor = relation.tags.colour;
	const color = colorKey
		? ROUTE_COLORS[colorKey]
		: /^#[0-9a-f]{6}$/i.test(taggedColor ?? "")
			? taggedColor.toLowerCase()
			: "#52525b";
	return { routeId, routeName, color };
}

export function transformOverpassNetwork(input) {
	const payload = overpassSchema.parse(input);
	const nodes = new Map(
		payload.elements
			.filter((element) => element.type === "node")
			.map((node) => [node.id, node]),
	);
	const ways = new Map(
		payload.elements
			.filter((element) => element.type === "way")
			.map((way) => [way.id, way]),
	);
	const relations = payload.elements.filter(
		(element) =>
			element.type === "relation" &&
			element.tags.type === "route" &&
			["subway", "train", "light_rail"].includes(element.tags.route) &&
			(element.tags.network?.includes("수도권 전철") ||
				(element.tags.route === "light_rail" &&
					(element.tags.ref === "W" ||
						element.tags.name?.includes("의정부경전철")))),
	);

	const lines = [];
	const stations = new Map();
	const seenRouteWays = new Set();
	for (const relation of relations) {
		const identity = routeIdentity(relation);
		for (const member of relation.members) {
			if (member.type === "way") {
				const way = ways.get(member.ref);
				const routeWayKey = `${identity.routeId}:${member.ref}`;
				if (!way || seenRouteWays.has(routeWayKey)) continue;
				seenRouteWays.add(routeWayKey);
				for (const coordinates of boundedGeometryRuns(way.geometry)) {
					lines.push({
						type: "Feature",
						properties: identity,
						geometry: { type: "LineString", coordinates },
					});
				}
			}
			if (member.type !== "node" || !/^(stop|station|stop_entry_only|stop_exit_only)$/.test(member.role)) {
				continue;
			}
			const node = nodes.get(member.ref);
			if (!node?.tags.name || !insideMotaBounds(node)) continue;
			const stationId = `osm:node:${node.id}`;
			const current = stations.get(stationId);
			if (current) {
				current.properties.routeIds.add(identity.routeId);
				continue;
			}
			stations.set(stationId, {
				type: "Feature",
				properties: {
					stationId,
					stationName: node.tags.name,
					routeIds: new Set([identity.routeId]),
				},
				geometry: {
					type: "Point",
					coordinates: [roundCoordinate(node.lon), roundCoordinate(node.lat)],
				},
			});
		}
	}

	lines.sort((left, right) => {
		const routeOrder = left.properties.routeId.localeCompare(
			right.properties.routeId,
			"ko",
			{ numeric: true },
		);
		if (routeOrder !== 0) return routeOrder;
		return JSON.stringify(left.geometry.coordinates).localeCompare(
			JSON.stringify(right.geometry.coordinates),
		);
	});
	const stationClusters = [];
	for (const station of [...stations.values()].sort((left, right) =>
		left.properties.stationId.localeCompare(right.properties.stationId, "en", {
			numeric: true,
		}),
	)) {
		const cluster = stationClusters.find(
			(candidate) =>
				candidate.properties.stationName === station.properties.stationName &&
				distanceKm(candidate.geometry.coordinates, station.geometry.coordinates) <= 0.4,
		);
		if (!cluster) {
			stationClusters.push({
				...station,
				properties: {
					...station.properties,
					routeIds: new Set(station.properties.routeIds),
				},
				coordinateCount: 1,
			});
			continue;
		}
		for (const routeId of station.properties.routeIds) {
			cluster.properties.routeIds.add(routeId);
		}
		const count = cluster.coordinateCount;
		cluster.geometry.coordinates = [
			roundCoordinate(
				(cluster.geometry.coordinates[0] * count + station.geometry.coordinates[0]) /
					(count + 1),
			),
			roundCoordinate(
				(cluster.geometry.coordinates[1] * count + station.geometry.coordinates[1]) /
					(count + 1),
			),
		];
		cluster.coordinateCount += 1;
	}
	const stationFeatures = stationClusters
		.sort((left, right) =>
			left.properties.stationId.localeCompare(right.properties.stationId, "en", {
				numeric: true,
			}),
		)
		.map((station) => ({
			type: station.type,
			properties: {
				...station.properties,
				routeIds: [...station.properties.routeIds].sort((left, right) =>
					left.localeCompare(right, "ko", { numeric: true }),
				),
			},
			geometry: station.geometry,
		}));

	return {
		attribution: "© OpenStreetMap contributors, ODbL",
		lines: { type: "FeatureCollection", features: lines },
		stations: { type: "FeatureCollection", features: stationFeatures },
	};
}

export function renderGeneratedModule(network, generatedAt) {
	return `export const SUBWAY_NETWORK_GENERATED_AT = ${JSON.stringify(generatedAt)};\nexport const SUBWAY_NETWORK = Object.freeze(${JSON.stringify(network, null, 2)});\n`;
}

export async function fetchOverpassPayload(fetchImplementation = fetch) {
	const query = `[out:json][timeout:180];\nrelation["type"="route"]["route"~"^(subway|train|light_rail)$"](${SEOUL_BOUNDS});\n(._;>>;);\nout body geom;`;
	const response = await fetchImplementation(OVERPASS_URL, {
		method: "POST",
		headers: {
			accept: "application/json",
			"content-type": "application/x-www-form-urlencoded;charset=UTF-8",
			"user-agent": "Mota-Network-Generator/1.0 (+https://github.com/m16khb-org/mota)",
		},
		body: new URLSearchParams({ data: query }),
		signal: AbortSignal.timeout(210_000),
	});
	if (!response.ok) throw new Error(`Overpass request failed with ${response.status}`);
	return overpassSchema.parse(await response.json());
}

async function run() {
	const payload = await fetchOverpassPayload();
	const network = transformOverpassNetwork(payload);
	const generatedAt = payload.osm3s?.timestamp_osm_base
		? new Date(payload.osm3s.timestamp_osm_base).toISOString()
		: new Date().toISOString();
	await writeFile(OUTPUT_URL, renderGeneratedModule(network, generatedAt), "utf8");
	process.stdout.write(
		`Wrote ${fileURLToPath(OUTPUT_URL)} (${network.lines.features.length} lines, ${network.stations.features.length} stations)\n`,
	);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
	await run();
}
