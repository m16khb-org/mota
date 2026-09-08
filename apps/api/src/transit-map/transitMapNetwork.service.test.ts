import { describe, expect, it } from "vitest";
import { TransitMapNetworkService } from "./transitMapNetwork.service";

const query = {
	west: 127.1,
	south: 37.52,
	east: 127.12,
	north: 37.54,
	zoom: 16,
};

describe("TransitMapNetworkService", () => {
	it("returns only subway geometry for every viewport", async () => {
		const service = new TransitMapNetworkService();

		const network = await service.network(query);

		expect(network.subway.lines.features.length).toBeGreaterThan(0);
		expect(network).not.toHaveProperty("bus");
	});

	it("keeps the network revision tied to the requested viewport", async () => {
		const service = new TransitMapNetworkService();

		const first = await service.network(query);
		const second = await service.network({ ...query, zoom: 17 });

		expect(first.revision).not.toBe(second.revision);
		expect(first.subway).not.toBe(second.subway);
	});
});
