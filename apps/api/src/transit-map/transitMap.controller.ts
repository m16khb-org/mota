import {
	BadRequestException,
	Controller,
	Get,
	Headers,
	Inject,
	Query,
	Res,
	Sse,
} from "@nestjs/common";
import { transitMapQuerySchema } from "@mota/contracts/transit-map";
import type { FastifyReply } from "fastify";
import { TransitMapNetworkService } from "./transitMapNetwork.service";
import { TransitMapStreamService } from "./transitMapStream.service";

@Controller("api/transit-map")
export class TransitMapController {
	constructor(
		@Inject(TransitMapNetworkService)
		private readonly networkService: TransitMapNetworkService,
		@Inject(TransitMapStreamService)
		private readonly streamService: TransitMapStreamService,
	) {}

	@Get("network")
	async network(
		@Query() queryValue: unknown,
		@Headers("if-none-match") ifNoneMatch: string | undefined,
		@Res({ passthrough: true }) reply: FastifyReply,
	) {
		const parsed = transitMapQuerySchema.safeParse(queryValue);
		if (!parsed.success) {
			throw new BadRequestException({
				error: "INVALID_TRANSIT_MAP_VIEWPORT",
				message: "서울 서비스 범위의 지도 영역과 확대 수준을 확인해 주세요.",
			});
		}
		const network = await this.networkService.network(parsed.data);
		const etag = `"${network.revision}"`;
		reply.header("Cache-Control", "public, max-age=300");
		reply.header("ETag", etag);
		if (ifNoneMatch === etag) {
			reply.status(304);
			return;
		}
		return network;
	}

	@Sse("events")
	events(
		@Query() queryValue: unknown,
		@Res({ passthrough: true }) reply: FastifyReply,
	) {
		const parsed = transitMapQuerySchema.safeParse(queryValue);
		if (!parsed.success) {
			throw new BadRequestException({
				error: "INVALID_TRANSIT_MAP_VIEWPORT",
				message: "서울 서비스 범위의 지도 영역과 확대 수준을 확인해 주세요.",
			});
		}
		reply.header("Cache-Control", "no-cache, no-transform");
		reply.header("Connection", "keep-alive");
		reply.header("X-Accel-Buffering", "no");
		return this.streamService.events(parsed.data);
	}
}
