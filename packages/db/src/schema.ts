import type { TransitSelections } from "@mota/contracts/transit-settings";
import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const userSettings = pgTable("user_settings", {
  authUserId: text("auth_user_id").primaryKey(),
  version: integer("version").notNull().default(1),
  selections: jsonb("selections").$type<TransitSelections>().notNull(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "date",
  })
    .notNull()
    .defaultNow(),
});
