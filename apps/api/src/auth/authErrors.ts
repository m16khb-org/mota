/**
 * The one failure mode that must never be reported as "signed out": an
 * upstream (the auth-gateway or the Supabase JWKS) could not be reached, so
 * the session state is unknown rather than absent.
 */
export class AuthUpstreamUnavailableError extends Error {
  readonly upstream: string;

  constructor(upstream: string) {
    super(`auth upstream is unavailable: ${upstream}`);
    this.name = "AuthUpstreamUnavailableError";
    this.upstream = upstream;
  }
}
