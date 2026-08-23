import {
  transitSelectionsSchema,
  type TransitSelections,
} from "@mota/contracts/transit-settings";
import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { userSettings } from "./schema";

type SettingsDatabase = PostgresJsDatabase<{
  userSettings: typeof userSettings;
}>;

export interface StoredUserSettings {
  readonly authUserId: string;
  readonly version: number;
  readonly selections: TransitSelections;
  readonly updatedAt: string;
}

export interface UserSettingsRepository {
  find(authUserId: string): Promise<StoredUserSettings | null>;
  save(
    authUserId: string,
    expectedVersion: number,
    selections: TransitSelections,
  ): Promise<StoredUserSettings>;
}

export class SettingsVersionConflictError extends Error {
  constructor() {
    super("User settings version conflict.");
    this.name = "SettingsVersionConflictError";
  }
}

export class InvalidStoredSettingsError extends Error {
  constructor() {
    super("Stored user settings are invalid.");
    this.name = "InvalidStoredSettingsError";
  }
}

function toStored(
  row: typeof userSettings.$inferSelect,
): StoredUserSettings {
  const parsed = transitSelectionsSchema.safeParse(row.selections);
  if (!parsed.success) {
    throw new InvalidStoredSettingsError();
  }
  return {
    authUserId: row.authUserId,
    version: row.version,
    selections: parsed.data,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class DrizzleUserSettingsRepository
  implements UserSettingsRepository
{
  constructor(private readonly database: SettingsDatabase) {}

  async find(authUserId: string): Promise<StoredUserSettings | null> {
    const [row] = await this.database
      .select()
      .from(userSettings)
      .where(eq(userSettings.authUserId, authUserId))
      .limit(1);
    return row ? toStored(row) : null;
  }

  async save(
    authUserId: string,
    expectedVersion: number,
    selections: TransitSelections,
  ): Promise<StoredUserSettings> {
    const now = new Date();
    const rows =
      expectedVersion === 0
        ? await this.database
            .insert(userSettings)
            .values({
              authUserId,
              version: 1,
              selections,
              updatedAt: now,
            })
            .onConflictDoNothing()
            .returning()
        : await this.database
            .update(userSettings)
            .set({
              version: expectedVersion + 1,
              selections,
              updatedAt: now,
            })
            .where(
              and(
                eq(userSettings.authUserId, authUserId),
                eq(userSettings.version, expectedVersion),
              ),
            )
            .returning();
    const row = rows[0];
    if (!row) {
      throw new SettingsVersionConflictError();
    }
    return toStored(row);
  }
}
