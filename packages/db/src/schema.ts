import type { TransitSelections } from "@mota/contracts/transit-settings";
import {
  bigserial,
  index,
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

/** One row per hashed external-key scope. The key itself never enters this table. */
export const subwayRequestBudgetScopes = pgTable(
  "subway_request_budget_scopes",
  {
    scopeHash: text("scope_hash").primaryKey(),
    positionCursor: integer("position_cursor").notNull().default(0),
    quotaBlockedUntil: timestamp("quota_blocked_until", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
);

/** Each row is a request reserved before the upstream call, including failures. */
export const subwayRequestReservations = pgTable(
  "subway_request_reservations",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    scopeHash: text("scope_hash")
      .notNull()
      .references(() => subwayRequestBudgetScopes.scopeHash, {
        onDelete: "cascade",
      }),
    lane: text("lane").notNull(),
    line: text("line"),
    reservedAt: timestamp("reserved_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
  },
  (table) => [
    index("subway_request_reservations_scope_reserved_at_idx").on(
      table.scopeHash,
      table.reservedAt,
    ),
  ],
);
