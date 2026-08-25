import { z } from "zod";

export const authUserSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email().optional(),
});

export type AuthUser = Readonly<z.infer<typeof authUserSchema>>;

export const authSessionResponseSchema = z.discriminatedUnion(
  "authenticated",
  [
    z.object({
      authenticated: z.literal(true),
      user: authUserSchema,
    }),
    z.object({
      authenticated: z.literal(false),
    }),
  ],
);

export type AuthSessionResponse = Readonly<
  z.infer<typeof authSessionResponseSchema>
>;
