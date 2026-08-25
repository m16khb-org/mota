import type { AuthSessionState } from "../hooks/useAuthSession";
import type { TransitSyncStatus } from "../hooks/useTransitSelections";
import { GoogleLogin } from "./GoogleLogin";

interface BrandHeaderProps {
  readonly session: AuthSessionState;
  readonly syncStatus: TransitSyncStatus;
  readonly onLogout?: (() => void | Promise<void>) | undefined;
}

export function BrandHeader({ session, syncStatus, onLogout }: BrandHeaderProps) {
  return (
    <header className="brand-header">
      <div className="brand-mark" aria-hidden="true">
        <img
          src="/pwa-icon.svg"
          alt=""
          width="48"
          height="48"
        />
      </div>
      <div className="brand-copy">
        <h1>모타</h1>
        <p>지금, 뭐 타?</p>
      </div>
      <GoogleLogin
        session={session}
        syncStatus={syncStatus}
        onLogout={onLogout}
      />
    </header>
  );
}
