import { z } from "zod";
import { subwayStationSchema } from "./subway";

export const CommuteProcedureIdSchema = z
  .string()
  .min(1)
  .brand<"CommuteProcedureId">();
export const CommuteStepIdSchema = z.string().min(1).brand<"CommuteStepId">();
export const CommuteFavoriteIdSchema = z
  .string()
  .min(1)
  .brand<"CommuteFavoriteId">();

/** `src/domain/bus.ts` keeps its route-id schema private; the identical brand
 * tag keeps values here assignable to its exported `RouteId` type. */
const routeIdSchema = z.string().min(1).brand<"RouteId">();

/** `busStopSchema` coerces ids and zero-pads ARS ids for upstream payloads.
 * Persisted identity must never be coerced or fabricated (a blank ARS would
 * become "00000"), so the saved contracts use local non-coercing schemas with
 * the same brand tags as the exported `StopId`/`ArsId` types. */
const stopIdSchema = z.string().min(1).brand<"StopId">();
const arsIdSchema = z
  .string()
  .regex(/^\d{5}$/)
  .brand<"ArsId">();

/** Segment durations are whole minutes; a saved zero/negative/non-integer
 * duration can never produce honest ETA output. */
const minutesSchema = z.number().int().min(1);

export const walkCommuteStepSchema = z.strictObject({
  id: CommuteStepIdSchema,
  kind: z.literal("walk"),
  minutes: minutesSchema,
});

export const busCommuteStepSchema = z.strictObject({
  id: CommuteStepIdSchema,
  kind: z.literal("bus"),
  stopId: stopIdSchema,
  arsId: arsIdSchema,
  routeId: routeIdSchema,
  routeName: z.string().min(1),
  direction: z.string().min(1),
  rideMinutes: minutesSchema,
  fallbackWaitMinutes: minutesSchema,
});

export const subwayCommuteStepSchema = z.strictObject({
  id: CommuteStepIdSchema,
  kind: z.literal("subway"),
  stationId: subwayStationSchema.shape.id,
  apiStationName: z.string().min(1),
  subwayId: z.string().min(1),
  updnLine: z.string().min(1),
  lineName: z.string().min(1),
  trainLineNm: z.string().min(1),
  rideMinutes: minutesSchema,
  fallbackWaitMinutes: minutesSchema,
});

export const commuteStepSchema = z.discriminatedUnion("kind", [
  walkCommuteStepSchema,
  busCommuteStepSchema,
  subwayCommuteStepSchema,
]);

const commuteStepsSchema = z
  .array(commuteStepSchema)
  .min(1)
  .superRefine((steps, ctx) => {
    const seen = new Set<string>();
    for (const [index, step] of steps.entries()) {
      if (seen.has(step.id)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "id"],
          message: `duplicate step id: ${step.id}`,
        });
      }
      seen.add(step.id);
    }
  });

export const readyCommuteProcedureSchema = z.strictObject({
  id: CommuteProcedureIdSchema,
  kind: z.literal("ready"),
  name: z.string().min(1),
  steps: commuteStepsSchema,
});

/** Auto procedures persist only the ordered point identities; services,
 * waits, and ride times are derived at run time. */
const autoProcedurePointSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("stop"),
    stopId: stopIdSchema,
    arsId: arsIdSchema,
  }),
  z.strictObject({
    type: z.literal("station"),
    stationId: subwayStationSchema.shape.id,
    apiStationName: z.string().min(1),
  }),
]);

export const autoCommuteProcedureSchema = z.strictObject({
  id: CommuteProcedureIdSchema,
  kind: z.literal("auto"),
  name: z.string().min(1),
  points: z.array(autoProcedurePointSchema).min(1),
});

export const commuteProcedureSchema = z.discriminatedUnion("kind", [
  readyCommuteProcedureSchema,
  autoCommuteProcedureSchema,
]);

/** A saved procedure is either fully authored (ready) or a pure geographic
 * itinerary (auto). Superseded v3 route options are discarded on migration
 * rather than kept as drafts. */
export const savedCommuteProcedureSchema = commuteProcedureSchema;

export const busCommuteFavoriteSchema = z.strictObject({
  id: CommuteFavoriteIdSchema,
  kind: z.literal("bus"),
  stopId: stopIdSchema,
  arsId: arsIdSchema,
  routeId: routeIdSchema,
  routeName: z.string().min(1),
  direction: z.string().min(1),
  accessMinutes: minutesSchema,
});

export const subwayCommuteFavoriteSchema = z.strictObject({
  id: CommuteFavoriteIdSchema,
  kind: z.literal("subway"),
  stationId: subwayStationSchema.shape.id,
  apiStationName: z.string().min(1),
  subwayId: z.string().min(1),
  updnLine: z.string().min(1),
  lineName: z.string().min(1),
  trainLineNm: z.string().min(1),
  accessMinutes: minutesSchema,
});

export const commuteFavoriteSchema = z.discriminatedUnion("kind", [
  busCommuteFavoriteSchema,
  subwayCommuteFavoriteSchema,
]);

export type CommuteProcedureId = z.infer<typeof CommuteProcedureIdSchema>;
export type CommuteStepId = z.infer<typeof CommuteStepIdSchema>;
export type CommuteFavoriteId = z.infer<typeof CommuteFavoriteIdSchema>;
export type WalkCommuteStep = Readonly<z.infer<typeof walkCommuteStepSchema>>;
export type BusCommuteStep = Readonly<z.infer<typeof busCommuteStepSchema>>;
export type SubwayCommuteStep = Readonly<
  z.infer<typeof subwayCommuteStepSchema>
>;
export type CommuteStep = z.infer<typeof commuteStepSchema>;
export type CommuteProcedure = z.infer<typeof commuteProcedureSchema>;
export type SavedCommuteProcedure = CommuteProcedure;
export type ReadyCommuteProcedure = Readonly<
  z.infer<typeof readyCommuteProcedureSchema>
>;
export type AutoCommuteProcedure = Readonly<
  z.infer<typeof autoCommuteProcedureSchema>
>;
export type AutoProcedurePoint = Readonly<
  z.infer<typeof autoProcedurePointSchema>
>;
export type BusCommuteFavorite = Readonly<
  z.infer<typeof busCommuteFavoriteSchema>
>;
export type SubwayCommuteFavorite = Readonly<
  z.infer<typeof subwayCommuteFavoriteSchema>
>;
export type CommuteFavorite = z.infer<typeof commuteFavoriteSchema>;
