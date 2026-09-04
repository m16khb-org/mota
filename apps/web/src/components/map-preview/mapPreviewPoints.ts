import type { BusStop } from "../../domain/bus";
import type { SubwayStation } from "../../domain/subway";

export type MapPreviewPoint = Readonly<{
	readonly key: `bus:${string}` | `subway:${string}`;
	readonly coordinates: readonly [number, number];
	readonly mode: "bus" | "subway";
	readonly name: string;
	readonly detail: string;
	readonly distance: number;
	readonly accessibleName: string;
	readonly entity: BusStop | SubwayStation;
}>;

function allocatePointKey(
	baseKey: `bus:${string}` | `subway:${string}`,
	occurrence: number,
	canonicalKeys: ReadonlySet<string>,
	usedKeys: ReadonlySet<string>,
): typeof baseKey {
	if (occurrence === 1) return baseKey;
	let suffix = occurrence;
	let key: typeof baseKey;
	do {
		key = `${baseKey}#${suffix}` as typeof baseKey;
		suffix += 1;
	} while (canonicalKeys.has(key) || usedKeys.has(key));
	return key;
}

export function mapPreviewPoints(busStops: readonly BusStop[], stations: readonly SubwayStation[]): readonly MapPreviewPoint[] {
	const points: MapPreviewPoint[] = [];
	const canonicalKeys = new Set<string>();
	for (const stop of busStops) canonicalKeys.add(`bus:${stop.id}`);
	for (const station of stations) canonicalKeys.add(`subway:${station.id}`);
	const usedKeys = new Set<string>();
	const occurrences = new Map<string, number>();
	for (const stop of busStops) {
		const baseKey = `bus:${stop.id}` as const;
		const occurrence = (occurrences.get(baseKey) ?? 0) + 1;
		occurrences.set(baseKey, occurrence);
		const key = allocatePointKey(baseKey, occurrence, canonicalKeys, usedKeys);
		usedKeys.add(key);
		points.push({
			key,
			coordinates: [stop.lng, stop.lat],
			mode: "bus",
			name: stop.name,
			detail: stop.arsId,
			distance: stop.distanceMeters,
			accessibleName: `버스 ${stop.name}`,
			entity: stop,
		});
	}
	for (const station of stations) {
		const baseKey = `subway:${station.id}` as const;
		const occurrence = (occurrences.get(baseKey) ?? 0) + 1;
		occurrences.set(baseKey, occurrence);
		const key = allocatePointKey(baseKey, occurrence, canonicalKeys, usedKeys);
		usedKeys.add(key);
		points.push({
			key,
			coordinates: [station.lng, station.lat],
			mode: "subway",
			name: station.name,
			detail: station.line,
			distance: station.distanceMeters,
			accessibleName: `지하철 ${station.name}`,
			entity: station,
		});
	}
	return points;
}

export const toMapPreviewPoints = mapPreviewPoints;
