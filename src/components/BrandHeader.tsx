import { Clock3 } from "lucide-react";

export function BrandHeader() {
  return (
    <header className="brand-header">
      <div className="brand-mark" aria-hidden="true">
        <Clock3 />
      </div>
      <div className="brand-copy">
        <h1>모타</h1>
        <p>지금, 뭐 타?</p>
      </div>
    </header>
  );
}
