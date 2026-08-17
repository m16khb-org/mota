export function resolveHostname(hostname: string | undefined): string {
  return hostname ?? "0.0.0.0";
}
