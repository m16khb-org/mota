import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { userSettings } from "./schema";

describe("userSettings schema", () => {
  it("stores only Supabase identity and versioned selections", () => {
    const table = getTableConfig(userSettings);

    expect(table.name).toBe("user_settings");
    expect(table.columns.map((column) => column.name)).toEqual([
      "auth_user_id",
      "version",
      "selections",
      "updated_at",
    ]);
    expect(table.primaryKeys).toHaveLength(0);
    expect(
      table.columns.find((column) => column.name === "auth_user_id")
        ?.primary,
    ).toBe(true);
  });
});
