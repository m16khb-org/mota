import { useEffect, useState } from "react";

interface SessionResponse {
  readonly authenticated?: unknown;
}

export function useGatewaySession() {
  const [checked, setChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    let mounted = true;

    void fetch("/api/auth/session", {
      credentials: "include",
      signal: AbortSignal.timeout(8_000),
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as SessionResponse;
      })
      .then((session) => {
        if (!mounted) return;
        setAuthenticated(session?.authenticated === true);
        setChecked(true);
      })
      .catch(() => {
        if (mounted) setChecked(true);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return { authenticated, checked };
}
