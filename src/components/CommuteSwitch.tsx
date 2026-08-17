import { Building2, House } from "lucide-react";
import { type KeyboardEvent, useRef } from "react";
import type { CommuteDirection } from "../domain/bus";

interface CommuteSwitchProps {
  readonly value: CommuteDirection;
  readonly onChange: (direction: CommuteDirection) => void;
}
const OPTIONS = [
  { value: "company", label: "회사로", icon: Building2 },
  { value: "home", label: "집으로", icon: House },
] as const;

export function CommuteSwitch({ value, onChange }: CommuteSwitchProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = (index + 1) % OPTIONS.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = (index - 1 + OPTIONS.length) % OPTIONS.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = OPTIONS.length - 1;
        break;
    }

    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    const nextOption = OPTIONS[nextIndex];
    tabRefs.current[nextIndex]?.focus();
    if (nextOption) {
      onChange(nextOption.value);
    }
  };

  return (
    <div className="commute-switch" role="tablist" aria-label="통근 방향">
      {OPTIONS.map((option, index) => {
        const Icon = option.icon;
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            id={`commute-tab-${option.value}`}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls="commute-panel"
            tabIndex={selected ? 0 : -1}
            className={selected ? "is-active" : ""}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            <Icon aria-hidden="true" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
