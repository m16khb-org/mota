import { Navigation } from "lucide-react";

export function BrandHeader() {
  return (
    <header className="brand-header">
      <div className="brand-mark" aria-hidden="true">
        <Navigation />
      </div>
      <div className="brand-copy">
        <h1>모타</h1>
        <span>다음 도착만 빠르게</span>
      </div>
    </header>
  );
}
