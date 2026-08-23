import {
  gatewaySessionResponseSchema,
  type GatewayUser,
} from "@mota/contracts/auth";
import { useEffect, useState } from "react";

export interface GatewaySessionState {
  readonly authenticated: boolean;
  readonly checked: boolean;
  readonly user: GatewayUser | null;
  readonly error: string | null;
}

const INITIAL_SESSION: GatewaySessionState = {
  authenticated: false,
  checked: false,
  user: null,
  error: null,
};

export function useGatewaySession(): GatewaySessionState {
  const [session, setSession] =
    useState<GatewaySessionState>(INITIAL_SESSION);

  useEffect(() => {
    let mounted = true;

    void fetch("/api/auth/session", {
      credentials: "include",
      signal: AbortSignal.timeout(8_000),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("session request failed");
        }
        return gatewaySessionResponseSchema.parse(await response.json());
      })
      .then((result) => {
        if (!mounted) {
          return;
        }
        setSession(
          result.authenticated
            ? {
                authenticated: true,
                checked: true,
                user: result.user,
                error: null,
              }
            : {
                authenticated: false,
                checked: true,
                user: null,
                error: null,
              },
        );
      })
      .catch(() => {
        if (mounted) {
          setSession({
            authenticated: false,
            checked: true,
            user: null,
            error: "로그인 상태를 확인하지 못했습니다.",
          });
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  return session;
}
