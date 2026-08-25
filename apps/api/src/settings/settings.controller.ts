import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  Inject,
  Put,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { transitSettingsUpdateSchema } from "@mota/contracts/transit-settings";
import {
  SettingsVersionConflictError,
  type UserSettingsRepository,
} from "@mota/db";
import {
  SESSION_VERIFIER,
  SETTINGS_REPOSITORY,
  type SessionVerifier,
} from "../app.tokens";
import { type AuthUser } from "@mota/contracts/auth";
import { SupabaseUnavailableError } from "../auth/supabaseClient";

@Controller("api/settings")
export class SettingsController {
  private readonly verifySession: SessionVerifier;
  private readonly repository: UserSettingsRepository;

  constructor(
    @Inject(SESSION_VERIFIER)
    verifySession: SessionVerifier,
    @Inject(SETTINGS_REPOSITORY)
    repository: UserSettingsRepository,
  ) {
    this.verifySession = verifySession;
    this.repository = repository;
  }

  private async requireUser(
    cookie: string | undefined,
    reply: FastifyReply,
  ) {
    let user: AuthUser | null;
    try {
      user = await this.verifySession(cookie, (cookies) => {
        reply.header("set-cookie", [...cookies]);
      });
    } catch (error) {
      if (error instanceof SupabaseUnavailableError) {
        throw new ServiceUnavailableException({
          error: "AUTH_UPSTREAM_UNAVAILABLE",
          message: "로그인 상태를 확인하지 못했습니다.",
        });
      }
      throw error;
    }
    if (!user) {
      throw new UnauthorizedException({
        error: "AUTH_REQUIRED",
        message: "로그인이 필요합니다.",
      });
    }
    return user;
  }

  @Get()
  async find(
    @Headers("cookie") cookie: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const user = await this.requireUser(cookie, reply);
    const stored = await this.repository.find(user.sub);
    return stored
      ? { version: stored.version, selections: stored.selections }
      : { version: 0, selections: null };
  }

  @Put()
  async save(
    @Headers("cookie") cookie: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Body() body: unknown,
  ) {
    const user = await this.requireUser(cookie, reply);
    const parsed = transitSettingsUpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: "INVALID_SETTINGS",
        message: "저장할 설정 형식이 올바르지 않습니다.",
      });
    }
    try {
      const saved = await this.repository.save(
        user.sub,
        parsed.data.version,
        parsed.data.selections,
      );
      return { version: saved.version, selections: saved.selections };
    } catch (error) {
      if (error instanceof SettingsVersionConflictError) {
        throw new ConflictException({
          error: "SETTINGS_VERSION_CONFLICT",
          message: "다른 화면에서 설정이 변경되었습니다.",
        });
      }
      throw error;
    }
  }
}
