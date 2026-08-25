import {
  authSessionResponseSchema,
  type AuthUser,
} from "@mota/contracts/auth";
import { useCallback, useEffect, useState } from "react";

export interface AuthSessionState {
  readonly authenticated: boolean;
  readonly checked: boolean;
  readonly user: AuthUser | null;
  readonly error: string | null;
}

const INITIAL_SESSION: AuthSessionState = {
  authenticated: false,
  checked: false,
  user: null,
  error: null,
};

const ANONYMOUS_SESSION: AuthSessionState = {
  authenticated: false,
  checked: true,
  user: null,
  error: null,
};

export function useAuthSession(): AuthSessionState & {
  readonly logout: () => Promise<void>;
} {
  const [session, setSession] =
    useState<AuthSessionState>(INITIAL_SESSION);

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
        return authSessionResponseSchema.parse(await response.json());
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

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      // 서버 쿠키 정리 실패여도 로컬 상태는 익명으로 되돌린다
    }
    setSession(ANONYMOUS_SESSION);
  }, []);

  return { ...session, logout };
}
