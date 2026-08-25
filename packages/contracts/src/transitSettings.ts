import { z } from "zod";
import { busStopSchema } from "./bus";
import { subwayStationSchema } from "./subway";

/** How many saved bus stops can be watched at the same time. */
export const MAX_SELECTED_BUS_STOPS = 4;

export const COMMUTE_CONTEXTS = ["toWork", "toHome"] as const;
export const commuteContextSchema = z.enum(COMMUTE_CONTEXTS);
export type CommuteContext = z.infer<typeof commuteContextSchema>;

const transitPointSelectionsInputSchema = z.object({
  busStops: z.array(busStopSchema),
  subwayStations: z.array(subwayStationSchema),
  /** Multi-watch selection (v2). Older documents carry the singular
   * `selectedBusStopId` instead and migrate to a one-element list on read. */
  selectedBusStopIds: z
    .array(busStopSchema.shape.id)
    .max(MAX_SELECTED_BUS_STOPS)
    .optional(),
  selectedBusStopId: busStopSchema.shape.id.nullable().optional(),
  selectedSubwayStationId: subwayStationSchema.shape.id
    .nullable()
    .optional(),
});

export const transitPointSelectionsSchema =
  transitPointSelectionsInputSchema.transform((selections) => ({
    busStops: selections.busStops,
    subwayStations: selections.subwayStations,
    selectedBusStopIds: [
      ...new Set(
        selections.selectedBusStopIds ??
          (selections.selectedBusStopId === null ||
          selections.selectedBusStopId === undefined
            ? []
            : [selections.selectedBusStopId]),
      ),
    ],
    selectedSubwayStationId: selections.selectedSubwayStationId ?? null,
  }));

export type TransitPointSelections = Readonly<
  z.infer<typeof transitPointSelectionsSchema>
>;

const commuteSelectionsInputSchema = z.object({
  commutes: z.object({
    toWork: transitPointSelectionsSchema,
    toHome: transitPointSelectionsSchema,
  }),
});

export const transitSelectionsSchema = z
  .union([commuteSelectionsInputSchema, transitPointSelectionsSchema])
  .transform((selections) =>
    "commutes" in selections
      ? selections
      : {
          commutes: {
            toWork: selections,
            toHome: selections,
          },
        },
  );

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
