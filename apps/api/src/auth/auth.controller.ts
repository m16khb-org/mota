import {
  Controller,
  Get,
  Headers,
  Inject,
  ServiceUnavailableException,
} from "@nestjs/common";
import { SESSION_VERIFIER } from "../app.tokens";
import {
  GatewayUnavailableError,
  type SessionVerifier,
} from "./gateway";

@Controller("api/auth")
export class AuthController {
  private readonly verifySession: SessionVerifier;

  constructor(
    @Inject(SESSION_VERIFIER)
    verifySession: SessionVerifier,
  ) {
    this.verifySession = verifySession;
  }

  @Get("session")
  async session(@Headers("cookie") cookie: string | undefined) {
    try {
      const user = await this.verifySession(cookie);
      return user
        ? { authenticated: true as const, user }
        : { authenticated: false as const };
    } catch (error) {
      if (error instanceof GatewayUnavailableError) {
        throw new ServiceUnavailableException({
          error: "AUTH_GATEWAY_UNAVAILABLE",
          message: "로그인 상태를 확인하지 못했습니다.",
        });
      }
      throw error;
    }
  }
}
