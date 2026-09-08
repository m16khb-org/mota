CREATE TABLE "subway_request_budget_scopes" (
	"scope_hash" text PRIMARY KEY NOT NULL,
	"position_cursor" integer DEFAULT 0 NOT NULL,
	"quota_blocked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subway_request_reservations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"scope_hash" text NOT NULL,
	"lane" text NOT NULL,
	"line" text,
	"reserved_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subway_request_reservations" ADD CONSTRAINT "subway_request_reservations_scope_fk" FOREIGN KEY ("scope_hash") REFERENCES "public"."subway_request_budget_scopes"("scope_hash") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "subway_request_reservations_scope_reserved_at_idx" ON "subway_request_reservations" USING btree ("scope_hash","reserved_at");
