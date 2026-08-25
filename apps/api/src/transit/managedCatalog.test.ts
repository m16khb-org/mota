import { afterEach, describe, expect, it, vi } from "vitest";
import { ManagedCatalog } from "./managedCatalog";

afterEach(() => {
  vi.useRealTimers();
});

function catalogOptions<T>(
  loader: () => Promise<readonly T[]>,
  now: () => number,
  schedule = false,
) {
  return {
    source: "test",
    loader,
    now,
    random: () => 0,
    refreshMs: 1_000,
    retryMs: 100,
    minimumItems: 1,
    schedule,
    onEvent: vi.fn(),
  };
}

describe("ManagedCatalog", () => {
  it("shares one cold load across concurrent readers", async () => {
    let release: ((items: readonly number[]) => void) | undefined;
    const loader = vi.fn(
      () =>
        new Promise<readonly number[]>((resolve) => {
          release = resolve;
        }),
    );
    const catalog = new ManagedCatalog(catalogOptions(loader, () => 0));

    const first = catalog.read();
    const second = catalog.read();
    expect(loader).toHaveBeenCalledTimes(1);
    release?.([1, 2]);

    await expect(first).resolves.toEqual([1, 2]);
    await expect(second).resolves.toEqual([1, 2]);
  });

  it("atomically swaps a due snapshot on refresh", async () => {
    let now = 0;
    const loader = vi
      .fn<() => Promise<readonly number[]>>()
      .mockResolvedValueOnce([1])
      .mockResolvedValueOnce([2]);
    const catalog = new ManagedCatalog(catalogOptions(loader, () => now));

    await expect(catalog.read()).resolves.toEqual([1]);
    now = 1_001;
    await expect(catalog.refreshIfDue()).resolves.toBe(true);
    await expect(catalog.read()).resolves.toEqual([2]);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("keeps stale data when a refresh fails", async () => {
    let now = 0;
    const loader = vi
      .fn<() => Promise<readonly number[]>>()
      .mockResolvedValueOnce([1])
      .mockRejectedValueOnce(new Error("upstream down"));
    const catalog = new ManagedCatalog(catalogOptions(loader, () => now));

    await catalog.read();
    now = 1_001;
    await expect(catalog.refreshIfDue()).rejects.toThrow("upstream down");
    await expect(catalog.read()).resolves.toEqual([1]);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("runs and clears the proactive refresh timer", async () => {
    vi.useFakeTimers();
    let now = 0;
    const loader = vi
      .fn<() => Promise<readonly number[]>>()
      .mockResolvedValue([1]);
    const catalog = new ManagedCatalog(
      catalogOptions(loader, () => now, true),
    );

    catalog.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(loader).toHaveBeenCalledTimes(1);

    now = 1_000;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(loader).toHaveBeenCalledTimes(2);

    catalog.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
