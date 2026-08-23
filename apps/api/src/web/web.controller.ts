import {
  Controller,
  Get,
  NotFoundException,
  Req,
  Res,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

type StaticReply = FastifyReply & {
  sendFile(path: string): unknown;
};

@Controller()
export class WebController {
  @Get("*")
  index(@Req() request: FastifyRequest, @Res() reply: StaticReply) {
    if (
      request.url.startsWith("/api/") ||
      !request.headers.accept?.includes("text/html")
    ) {
      throw new NotFoundException();
    }
    reply.type("text/html");
    return reply.sendFile("index.html");
  }
}
