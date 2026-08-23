import { z } from "zod";
import { busStopSchema } from "./bus";
import { subwayStationSchema } from "./subway";

export const transitSelectionsSchema = z.object({
  busStops: z.array(busStopSchema),
  subwayStations: z.array(subwayStationSchema),
  selectedBusStopId: busStopSchema.shape.id.nullable(),
  selectedSubwayStationId: subwayStationSchema.shape.id.nullable(),
});

export type TransitSelections = Readonly<
  z.infer<typeof transitSelectionsSchema>
>;

export const transitSettingsSnapshotSchema = z.object({
  version: z.number().int().nonnegative(),
  selections: transitSelectionsSchema.nullable(),
});

export type TransitSettingsSnapshot = Readonly<
  z.infer<typeof transitSettingsSnapshotSchema>
>;

export const transitSettingsUpdateSchema = z.object({
  version: z.number().int().nonnegative(),
  selections: transitSelectionsSchema,
});

export type TransitSettingsUpdate = Readonly<
  z.infer<typeof transitSettingsUpdateSchema>
>;
