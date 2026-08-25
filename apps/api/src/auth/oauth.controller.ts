import { timingSafeEqual } from "node:crypto";
import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
  Redirect,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { AUTH_CONFIG } from "../app.tokens";
import {
  computeCodeChallenge,
  generateCodeVerifier,
  generateOAuthState,
} from "./pkce";
import {
  clearFlowCookieStrings,
  flowCookieNames,
  readCookieValue,
  secureCookies,
  serializeFlowCookies,
  serializeSessionCookies,
} from "./sessionCookies";
import {
  SupabaseAuthClient,
  SupabaseAuthError,
  type SupabaseClientConfig,
  type SupabaseSession,
} from "./supabaseClient";

export type OAuthConfig = SupabaseClientConfig & {
  readonly publicUrl: string;
};

/**
 * Mota's own Google login: an authorization-code + PKCE flow against the
 * shared Supabase project, coordinated by this API. The auth-gateway keeps
 * its session cookies host-only, so mota exchanges the one-time login code
 * for its own host-only session cookies instead of forwarding gateway
 * cookies.
 */
@Controller("api/auth")
export class OAuthController {
  constructor(
    @Inject(AUTH_CONFIG) private readonly config: OAuthConfig | null,
  ) {}

  @Get("google")
  @Redirect("", 302)
  async startLogin(
    @Query("return_to") returnTo: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ url: string }> {
    const config = this.requireConfig();
    const safeReturnTo = returnPath(returnTo);
    const verifier = generateCodeVerifier();
    const state = generateOAuthState();
    const challenge = await computeCodeChallenge(verifier);
    reply.header("set-cookie", [
      ...serializeFlowCookies(secureCookies(config.publicUrl), {
        verifier,
        state,
        returnUrl: safeReturnTo,
      }),
    ]);

    const authorizeUrl = new URL(`${config.supabaseUrl}/auth/v1/authorize`);
    authorizeUrl.searchParams.set("provider", "google");
    const callbackUrl = new URL(`${config.publicUrl}/api/auth/callback`);
    callbackUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("redirect_to", callbackUrl.toString());
    authorizeUrl.searchParams.set("code_challenge", challenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    return { url: authorizeUrl.toString() };
  }

  @Get("callback")
  @Redirect("", 302)
  async completeLogin(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ url: string }> {
    const config = this.requireConfig();
    const secure = secureCookies(config.publicUrl);
    const names = flowCookieNames(secure);
    const code = callbackCode(request.query);
    const state = callbackState(request.query);
    const verifier = readCookieValue(request.headers.cookie, names.verifier);
    const expectedState = readCookieValue(request.headers.cookie, names.state);
    if (
      code === null ||
      state === null ||
      verifier === null ||
      expectedState === null ||
      !secureEqual(state, expectedState)
    ) {
      reply.header("set-cookie", clearFlowCookieStrings(secure));
      throw new UnauthorizedException({
        error: "AUTH_CALLBACK_INVALID",
        message: "로그인을 다시 시작해 주세요.",
      });
    }

    let session: SupabaseSession;
    try {
      session = await new SupabaseAuthClient(config).exchangeCode(
        code,
        verifier,
      );
    } catch (error) {
      if (error instanceof SupabaseAuthError) {
        reply.header("set-cookie", clearFlowCookieStrings(secure));
        throw new UnauthorizedException({
          error: "AUTH_CALLBACK_INVALID",
          message: "로그인을 다시 시작해 주세요.",
        });
      }
      throw error;
    }

    const returnUrl = readCookieValue(request.headers.cookie, names.returnUrl);
    const redirectTo =
      returnUrl !== null && isSameSitePath(returnUrl) ? returnUrl : "/";
    reply.header("set-cookie", [
      ...clearFlowCookieStrings(secure),
      ...serializeSessionCookies(secure, session),
    ]);
    return { url: redirectTo };
  }

  private requireConfig(): OAuthConfig {
    if (this.config === null) {
      throw new ServiceUnavailableException({
        error: "AUTH_NOT_CONFIGURED",
        message: "로그인이 설정되어 있지 않습니다.",
      });
    }
    return this.config;
  }
}

function isSameSitePath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//");
}

function returnPath(returnTo: string | undefined): string {
  if (returnTo === undefined || returnTo === "") {
    return "/";
  }
  if (!isSameSitePath(returnTo)) {
    throw new BadRequestException("return_to must be a same-site path");
  }
  return returnTo;
}

function callbackCode(query: unknown): string | null {
  const code: unknown =
    typeof query === "object" && query !== null
      ? Reflect.get(query, "code")
      : undefined;
  return typeof code === "string" && code !== "" ? code : null;
}

function callbackState(query: unknown): string | null {
  const state: unknown =
    typeof query === "object" && query !== null
      ? Reflect.get(query, "state")
      : undefined;
  return typeof state === "string" && state !== "" ? state : null;
}

function secureEqual(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}
