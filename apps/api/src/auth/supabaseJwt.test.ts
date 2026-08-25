import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startFakeSupabase, type FakeSupabase } from "../../test/fake-supabase";
import { verifyAccessToken } from "./supabaseJwt";

describe("local Supabase token verification", () => {
  let supabase: FakeSupabase;

  beforeAll(async () => {
    supabase = await startFakeSupabase();
  });

  afterAll(async () => {
    await supabase.close();
  });

  const options = () => ({ issuer: supabase.issuer, jwksUrl: supabase.jwksUrl });

  it("accepts a signed token and returns the claims", async () => {
    const token = await supabase.signAccessToken({
      sub: "user-1",
      email: "user@example.com",
    });
    await expect(verifyAccessToken(token, options())).resolves.toEqual({
      sub: "user-1",
      email: "user@example.com",
    });
  });

  it("rejects garbage tokens as anonymous", async () => {
    await expect(verifyAccessToken("not-a-jwt", options())).resolves.toBeNull();
  });
});
