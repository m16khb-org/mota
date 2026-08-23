import { z } from "zod";

export const gatewayUserSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email().optional(),
});

export type GatewayUser = Readonly<z.infer<typeof gatewayUserSchema>>;

export const gatewaySessionResponseSchema = z.discriminatedUnion(
  "authenticated",
  [
    z.object({
      authenticated: z.literal(true),
      user: gatewayUserSchema,
    }),
    z.object({
      authenticated: z.literal(false),
    }),
  ],
);

export type GatewaySessionResponse = Readonly<
  z.infer<typeof gatewaySessionResponseSchema>
>;
