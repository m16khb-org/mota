import { BusFront } from "lucide-react";

export function BrandHeader() {
  return (
    <header className="brand-header">
      <div className="brand-mark" aria-hidden="true">
        <BusFront />
      </div>
      <div className="brand-copy">
        <span>서울 출퇴근</span>
        <h1>모타</h1>
      </div>
    </header>
  );
}
