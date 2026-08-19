import { z } from "zod";
import { busStopSchema } from "./bus";
import { subwayStationSchema } from "./subway";

export const CommuteRouteOptionIdSchema = z
  .string()
  .min(1)
  .brand<"CommuteRouteOptionId">();

export const commuteRouteOptionSchema = z.object({
  id: CommuteRouteOptionIdSchema,
  startStopId: busStopSchema.shape.id,
  transferStationId: subwayStationSchema.shape.id.nullable(),
});

export type CommuteRouteOptionId = z.infer<
  typeof CommuteRouteOptionIdSchema
>;
export type CommuteRouteOption = Readonly<
  z.infer<typeof commuteRouteOptionSchema>
>;
