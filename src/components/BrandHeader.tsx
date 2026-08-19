import { BusFront } from "lucide-react";
import { InstallPrompt } from "./InstallPrompt";

export function BrandHeader() {
  return (
    <header className="brand-header">
      <div className="brand-mark" aria-hidden="true">
        <BusFront />
      </div>
      <div className="brand-copy">
        <span>서울 출퇴근</span>
        <h1>곧 도착</h1>
      </div>
      <InstallPrompt />
    </header>
  );
}
