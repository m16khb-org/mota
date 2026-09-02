import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { AUTH_CONFIG } from "../app.tokens";
import { GatewayAuthClient, type GatewayRelay } from "./gatewayClient";
import type { GatewayClientConfig } from "./gatewayClient";

/**
 * Mota's same-origin login proxy for the central auth-gateway. The gateway
 * keeps its cookies host-only, so this service relays every Set-Cookie and
 * Location header in both directions and ends up owning an independent
 * session on its own origin without ever handling a token or a Supabase key.
 */
@Controller()
export class GatewayAuthController {
  constructor(
    @Inject(AUTH_CONFIG) private readonly config: GatewayClientConfig | null,
  ) {}

  @Get("api/auth/google")
  async startLogin(
    @Query("return_to") returnTo: string | undefined,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const relay = await this.client().startLogin(returnPath(returnTo));
    this.send(reply, relay);
  }

  /**
   * The gateway accepts a callback target only at exactly `/auth/callback`,
   * so this route cannot live under `/api`. It is declared before the SPA
   * catch-all in the module's controller list.
   */
  @Get("auth/callback")
  async completeLogin(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const query = request.url.slice(request.url.indexOf("?") + 1);
    const relay = await this.client().completeLogin(
      request.url.includes("?") ? query : "",
      request.headers.cookie,
    );
    this.send(reply, relay);
  }

  @Post("api/auth/logout")
  @HttpCode(200)
  async logout(
    @Headers("cookie") cookie: string | undefined,
    @Headers("sec-fetch-site") fetchSite: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ status: "ok" }> {
    const relay = await this.client().logout(
      cookie,
      fetchSite === undefined ? {} : { "sec-fetch-site": fetchSite },
    );
    if (relay.setCookies.length > 0) {
      reply.header("set-cookie", [...relay.setCookies]);
    }
    return { status: "ok" };
  }

  private send(reply: FastifyReply, relay: GatewayRelay): void {
    if (relay.setCookies.length > 0) {
      reply.header("set-cookie", [...relay.setCookies]);
    }
    if (relay.location === null) {
      // A gateway that refuses the start or the callback answers without a
      // redirect; surface it as a client error rather than a blank 302.
      throw new BadRequestException({
        error: "AUTH_GATEWAY_REJECTED",
        message: "로그인을 다시 시작해 주세요.",
      });
    }
    void reply.status(relay.status).header("location", relay.location).send();
  }

  private client(): GatewayAuthClient {
    if (this.config === null) {
      throw new ServiceUnavailableException({
        error: "AUTH_NOT_CONFIGURED",
        message: "로그인이 설정되어 있지 않습니다.",
      });
    }
    return new GatewayAuthClient(this.config);
  }
}

function returnPath(returnTo: string | undefined): string {
  if (returnTo === undefined || returnTo === "") {
    return "/";
  }
  if (!returnTo.startsWith("/") || returnTo.startsWith("//")) {
    throw new BadRequestException("return_to must be a same-site path");
  }
  return returnTo;
}
