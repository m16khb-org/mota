import { transitMapEventSchema } from "@mota/contracts/transit-map";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./create-test-app";

const runningServers: Array<() => Promise<void>> = [];

afterEach(async () => {
	await Promise.all(runningServers.splice(0).map((close) => close()));
});

describe("transit map SSE", () => {
	it("frames the initial ready event over a real HTTP connection", async () => {
		const app = createApp(vi.fn());
		const server = await app.listen();
		runningServers.push(server.close);
		const abortController = new AbortController();

		const response = await fetch(
			`${server.url}/api/transit-map/events?west=127.10&south=37.52&east=127.12&north=37.54&zoom=16`,
			{ signal: abortController.signal },
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/event-stream");
		expect(response.headers.get("cache-control")).toContain("no-cache");
		expect(response.headers.get("cache-control")).toContain("no-transform");
		expect(response.headers.get("x-accel-buffering")).toBe("no");

		if (!response.body) throw new Error("SSE response did not expose a body.");
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let frame = "";
		while (!frame.includes("\n\n")) {
			const next = await reader.read();
			if (next.done) break;
			frame += decoder.decode(next.value, { stream: true });
		}
		expect(frame).toContain("event: ready");
		expect(frame).toMatch(/id: \d+/);
		const dataLine = frame
			.split("\n")
			.find((line) => line.startsWith("data: "));
		expect(dataLine).toBeDefined();
		if (!dataLine) throw new Error("SSE ready frame did not contain data.");
		expect(
			transitMapEventSchema.safeParse(JSON.parse(dataLine.slice(6))).success,
		).toBe(true);

		abortController.abort();
		await reader.cancel().catch(() => undefined);
	});
});
