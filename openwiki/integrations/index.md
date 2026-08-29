# Files

- [Seoul Upstream Data Sources](seoul-upstreams.md) - The exact URLs, methods, timeouts, byte caps, and Zod boundaries of the three external Seoul sources behind apps/api/src/upstream — the bus BIS pair on bus.go.kr, the k-skill subway arrivals proxy, and the quarterly T-Data station CSV — plus the UpstreamError to HTTP 502 failure mapping.
- [Supabase Auth Integration](supabase.md) - Mota's exact contract with the shared Supabase Auth project — the four endpoints called, the session and JWT claim schemas, the local ES256/JWKS verification rules, and the SupabaseAuthError vs SupabaseUnavailableError taxonomy that decides between anonymous/401 and 503.
