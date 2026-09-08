/** Shared upstream adapter error taxonomy. Routes map these onto fixed
 * 400/502 JSON shapes; adapters never format user-facing copy themselves. */
export const SEOUL_SUBWAY_QUOTA_CODE = "ERROR-337";

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly detail: string,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

export function errorDetail(error: unknown): string {
  if (error instanceof UpstreamError) {
    return error.detail;
  }
  return error instanceof Error ? error.message : "Unknown upstream failure";
}

export function isSeoulSubwayQuotaError(error: unknown): boolean {
  return (
    error instanceof UpstreamError &&
    error.detail.includes(SEOUL_SUBWAY_QUOTA_CODE)
  );
}
