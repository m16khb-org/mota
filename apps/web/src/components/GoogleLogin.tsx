import { CircleCheck, LogIn } from "lucide-react";
import type { AuthSessionState } from "../hooks/useAuthSession";
import type { TransitSyncStatus } from "../hooks/useTransitSelections";

interface GoogleLoginProps {
  readonly session: AuthSessionState;
  readonly syncStatus?: TransitSyncStatus;
}

const syncLabel: Record<TransitSyncStatus, string> = {
  local: "이 기기에 저장",
  loading: "설정 불러오는 중",
  saving: "서버 저장 중",
  synced: "서버에 저장됨",
  error: "저장 확인 필요",
};

export function GoogleLogin({
  session,
  syncStatus = "local",
}: GoogleLoginProps) {
  if (!session.checked) {
    return <span className="account-checking">로그인 확인 중</span>;
  }

  if (session.authenticated && session.user) {
    return (
      <span className="account-user">
        <CircleCheck aria-hidden="true" />
        <span>
          <strong>{session.user.email ?? "로그인됨"}</strong>
          <small>{syncLabel[syncStatus]}</small>
        </span>
      </span>
    );
  }

  const loginUrl = `/api/auth/google?return_to=${encodeURIComponent(
    window.location.pathname + window.location.search,
  )}`;

  return (
    <a className="google-login" href={loginUrl}>
      <LogIn aria-hidden="true" />
      Google로 로그인
    </a>
  );
}
