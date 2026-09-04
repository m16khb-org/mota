import { z } from "zod";

const SEOUL_LONGITUDE = z.number().finite().min(126.7).max(127.3);
const SEOUL_LATITUDE = z.number().finite().min(37.3).max(37.8);
const EARTH_RADIUS_KM = 6_371;

export const transitCoordinateSchema = z.tuple([
	SEOUL_LONGITUDE,
	SEOUL_LATITUDE,
]);

export const transitMapQuerySchema = z
	.object({
		west: z.coerce.number().finite().min(126.7).max(127.3),
		south: z.coerce.number().finite().min(37.3).max(37.8),
		east: z.coerce.number().finite().min(126.7).max(127.3),
		north: z.coerce.number().finite().min(37.3).max(37.8),
		zoom: z.coerce.number().finite().min(8).max(20),
	})
	.superRefine((query, context) => {
		if (query.west >= query.east) {
			context.addIssue({
				code: "custom",
				path: ["east"],
				message: "east must be greater than west",
			});
		}
		if (query.south >= query.north) {
			context.addIssue({
				code: "custom",
				path: ["north"],
				message: "north must be greater than south",
			});
		}
	});

export type TransitMapQuery = z.infer<typeof transitMapQuerySchema>;

export function viewportAreaSquareKm(
	query: Pick<TransitMapQuery, "west" | "south" | "east" | "north">,
): number {
	const midpointLatitudeRadians =
		(((query.south + query.north) / 2) * Math.PI) / 180;
	const widthKm =
		(((query.east - query.west) * Math.PI) / 180) *
		EARTH_RADIUS_KM *
		Math.cos(midpointLatitudeRadians);
	const heightKm =
		(((query.north - query.south) * Math.PI) / 180) * EARTH_RADIUS_KM;
	return widthKm * heightKm;
}

const lineStringGeometrySchema = z.object({
	type: z.literal("LineString"),
	coordinates: z.array(transitCoordinateSchema).min(2),
});

const pointGeometrySchema = z.object({
	type: z.literal("Point"),
	coordinates: transitCoordinateSchema,
});

export const transitRouteFeatureSchema = z.object({
	type: z.literal("Feature"),
	properties: z.object({
		routeId: z.string().min(1),
		routeName: z.string().min(1),
		color: z.string().regex(/^#[0-9a-f]{6}$/i),
	}),
	geometry: lineStringGeometrySchema,
});

export const subwayStationFeatureSchema = z.object({
	type: z.literal("Feature"),
	properties: z.object({
		stationId: z.string().min(1),
		stationName: z.string().min(1),
		routeIds: z.array(z.string().min(1)).min(1),
	}),
	geometry: pointGeometrySchema,
});

export const busStopFeatureSchema = z.object({
	type: z.literal("Feature"),
	properties: z.object({
		stopId: z.string().min(1),
		arsId: z.string().min(1).nullable(),
		stopName: z.string().min(1),
		routeIds: z.array(z.string().min(1)),
	}),
	geometry: pointGeometrySchema,
});

function featureCollectionSchema<T extends z.ZodType>(feature: T) {
	return z.object({
		type: z.literal("FeatureCollection"),
		features: z.array(feature),
	});
}

export const transitRouteCollectionSchema = featureCollectionSchema(
	transitRouteFeatureSchema,
);
export const subwayStationCollectionSchema = featureCollectionSchema(
	subwayStationFeatureSchema,
);
export const busStopCollectionSchema = featureCollectionSchema(
	busStopFeatureSchema,
);

export const transitAvailabilitySchema = z.enum([
	"live",
	"no-service",
	"unavailable",
	"unconfigured",
	"zoom-required",
]);

export type TransitAvailability = z.infer<typeof transitAvailabilitySchema>;

const transitVehicleBaseSchema = z.object({
	id: z.string().min(1),
	routeId: z.string().min(1),
	routeName: z.string().min(1),
	coordinates: transitCoordinateSchema,
	bearing: z.number().finite().min(0).max(360),
	direction: z.string().min(1),
	capturedAt: z.string().datetime(),
});

export const transitVehicleSchema = z.discriminatedUnion("mode", [
	transitVehicleBaseSchema.extend({
		mode: z.literal("bus"),
		positionBasis: z.literal("gps"),
	}),
	transitVehicleBaseSchema.extend({
		mode: z.literal("subway"),
		positionBasis: z.literal("station-segment"),
	}),
]);

export type TransitVehicle = z.infer<typeof transitVehicleSchema>;

export const subwayNetworkSchema = z.object({
	attribution: z.string().min(1),
	lines: transitRouteCollectionSchema,
	stations: subwayStationCollectionSchema,
});

export const busNetworkSchema = z.object({
	enabled: z.boolean(),
	reason: z.enum(["zoom-required", "unconfigured"]).optional(),
	attribution: z.string().min(1),
	routes: transitRouteCollectionSchema,
	stops: busStopCollectionSchema,
});

export const transitMapNetworkSchema = z.object({
	revision: z.string().min(1),
	generatedAt: z.string().datetime(),
	subway: subwayNetworkSchema,
	bus: busNetworkSchema,
});

export type TransitMapNetwork = z.infer<typeof transitMapNetworkSchema>;

export const transitMapEventSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("ready"),
		revision: z.string().min(1),
		modes: z.array(z.enum(["bus", "subway"])),
		serverTime: z.string().datetime(),
	}),
	z.object({
		kind: z.literal("vehicles"),
		bus: z.array(transitVehicleSchema),
		subway: z.array(transitVehicleSchema),
		capturedAt: z.string().datetime(),
	}),
	z.object({
		kind: z.literal("availability"),
		bus: transitAvailabilitySchema,
		subway: transitAvailabilitySchema,
		observedAt: z.string().datetime(),
	}),
	z.object({
		kind: z.literal("heartbeat"),
		serverTime: z.string().datetime(),
	}),
]);

export type TransitMapEvent = z.infer<typeof transitMapEventSchema>;

const sourceHealthSchema = z.object({
	status: transitAvailabilitySchema,
	successCount: z.number().int().nonnegative(),
	failureCount: z.number().int().nonnegative(),
	consecutiveFailures: z.number().int().nonnegative(),
	lastSuccessAt: z.string().datetime().nullable(),
	lastFailureAt: z.string().datetime().nullable(),
	lastDurationMs: z.number().finite().nonnegative().nullable(),
});

export const transitMapHealthSchema = z.object({
	subway: sourceHealthSchema,
	bus: sourceHealthSchema,
});

export type TransitMapHealth = z.infer<typeof transitMapHealthSchema>;
