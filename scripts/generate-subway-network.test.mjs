import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
	fetchOverpassPayload,
	transformOverpassNetwork,
} from "./generate-subway-network.mjs";

const fixture = JSON.parse(
	await readFile(
		new URL("./fixtures/subway-network-overpass.json", import.meta.url),
		"utf8",
	),
);

test("transforms route relations into deterministic line and station GeoJSON", () => {
	const result = transformOverpassNetwork(fixture);

	assert.deepEqual(result.lines.features[0].geometry.coordinates[0], [127, 37.5]);
	assert.deepEqual(
		result.lines.features.map(({ properties }) => ({
			routeId: properties.routeId,
			routeName: properties.routeName,
			color: properties.color,
		})),
		[
			{ routeId: "2", routeName: "2호선", color: "#00a84d" },
			{ routeId: "3", routeName: "3호선", color: "#ef7c1c" },
		],
	);
	assert.equal(result.stations.features.length, 3);
	assert.deepEqual(result.stations.features[1].properties, {
		stationId: "osm:node:2",
		stationName: "둘역",
		routeIds: ["2"],
	});
	assert.deepEqual(result.stations.features[0].properties.routeIds, ["2", "3"]);
	assert.match(result.attribution, /OpenStreetMap/);
	assert.match(result.attribution, /ODbL/);
});

test("rejects malformed Overpass payloads instead of emitting partial data", () => {
	assert.throws(() => transformOverpassNetwork({ elements: [{ type: "relation" }] }));
});

test("identifies the generator to Overpass and requests JSON", async () => {
	const payload = await fetchOverpassPayload(async (_url, options) => {
		assert.match(options.headers["user-agent"], /^Mota-Network-Generator\//);
		assert.equal(options.headers.accept, "application/json");
		return new Response(JSON.stringify(fixture), {
			status: 200,
			headers: { "content-type": "application/json" },
		});
	});

	assert.equal(payload.elements.length, fixture.elements.length);
});

test("keeps only metropolitan transit and deduplicates shared route ways", () => {
	const result = transformOverpassNetwork({
		...fixture,
		elements: [
			...fixture.elements,
			{
				type: "relation",
				id: 2003,
				tags: {
					type: "route",
					route: "subway",
					ref: "2",
					name: "서울 지하철 2호선 반대 방향",
					network: "수도권 전철",
				},
				members: fixture.elements.at(-2).members,
			},
			{
				type: "relation",
				id: 9000,
				tags: {
					type: "route",
					route: "train",
					ref: "201",
					name: "경부선 KTX",
					network: "KTX",
				},
				members: fixture.elements.at(-2).members,
			},
		],
	});

	assert.equal(result.lines.features.length, 2);
	assert.equal(result.stations.features.length, 3);
	assert.deepEqual(result.stations.features[0].properties.routeIds, ["2", "3"]);
});

test("clips relation geometry and stations to Mota's Seoul bounds", () => {
	const payload = structuredClone(fixture);
	payload.elements.find((element) => element.type === "way").geometry.unshift({
		lat: 37.5,
		lon: 126.6,
	});
	payload.elements.push({
		type: "node",
		id: 99,
		lat: 37.9,
		lon: 127,
		tags: { name: "범위밖역", railway: "station" },
	});
	payload.elements.at(-2).members.push({ type: "node", ref: 99, role: "stop" });

	const result = transformOverpassNetwork(payload);
	for (const line of result.lines.features) {
		for (const [longitude, latitude] of line.geometry.coordinates) {
			assert.ok(longitude >= 126.7 && longitude <= 127.3);
			assert.ok(latitude >= 37.3 && latitude <= 37.8);
		}
	}
	assert.equal(
		result.stations.features.some(
			(station) => station.properties.stationName === "범위밖역",
		),
		false,
	);
});

test("merges same-name platform nodes nearby without merging distant stations", () => {
	const payload = structuredClone(fixture);
	payload.elements.push(
		{
			type: "node",
			id: 4,
			lat: 37.5101,
			lon: 127.0101,
			tags: { name: "둘역", railway: "station" },
		},
		{
			type: "node",
			id: 5,
			lat: 37.6,
			lon: 127.1,
			tags: { name: "둘역", railway: "station" },
		},
	);
	const relation = payload.elements.find(
		(element) => element.type === "relation" && element.tags.ref === "3",
	);
	relation.members.push(
		{ type: "node", ref: 4, role: "stop" },
		{ type: "node", ref: 5, role: "stop" },
	);

	const result = transformOverpassNetwork(payload);
	const stationsNamedDul = result.stations.features.filter(
		(station) => station.properties.stationName === "둘역",
	);

	assert.equal(result.stations.features.length, 4);
	assert.equal(stationsNamedDul.length, 2);
	assert.deepEqual(stationsNamedDul[0].properties.routeIds, ["2", "3"]);
});

test("includes supported metropolitan light rail even when OSM omits the network tag", () => {
	const payload = structuredClone(fixture);
	payload.elements.push({
		type: "relation",
		id: 7533582,
		tags: {
			type: "route",
			route: "light_rail",
			ref: "W",
			name: "우이신설선: 북한산우이 → 신설동",
		},
		members: fixture.elements.at(-2).members,
	});

	const result = transformOverpassNetwork(payload);
	const lightRail = result.lines.features.find(
		(line) => line.properties.routeId === "W",
	);

	assert.deepEqual(lightRail.properties, {
		routeId: "W",
		routeName: "우이신설선",
		color: "#b7c450",
	});
});
