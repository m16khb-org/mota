import { Clock3 } from "lucide-react";
import type { GatewaySessionState } from "../hooks/useGatewaySession";
import type { TransitSyncStatus } from "../hooks/useTransitSelections";
import { GoogleLogin } from "./GoogleLogin";

interface BrandHeaderProps {
  readonly session: GatewaySessionState;
  readonly syncStatus: TransitSyncStatus;
}

export function BrandHeader({ session, syncStatus }: BrandHeaderProps) {
  return (
    <header className="brand-header">
      <div className="brand-mark" aria-hidden="true">
        <Clock3 />
      </div>
      <div className="brand-copy">
        <h1>모타</h1>
        <p>지금, 뭐 타?</p>
      </div>
      <GoogleLogin session={session} syncStatus={syncStatus} />
    </header>
  );
}
