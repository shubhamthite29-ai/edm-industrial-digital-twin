import React, { useEffect, useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

export interface IntegerParameterInputProps {
  id?: string;
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  placeholder?: string;
  onChange: (value: number) => void;
  onEnter?: () => void;
  disabled?: boolean;
}

export const IntegerParameterInput: React.FC<IntegerParameterInputProps> = ({
  id,
  label,
  unit,
  value,
  min,
  max,
  step = 1,
  placeholder,
  onChange,
  onEnter,
  disabled = false,
}) => {
  const [draft, setDraft] = useState<string>(() => (Number.isFinite(value) ? String(Math.round(value)) : String(min)));
  const [isFocused, setIsFocused] = useState<boolean>(false);

  // Sync draft when external value changes while not editing
  useEffect(() => {
    if (!isFocused && Number.isFinite(value)) {
      setDraft(String(Math.round(value)));
    }
  }, [value, isFocused]);

  const clampValue = (val: number): number => {
    return Math.max(min, Math.min(max, Math.round(val)));
  };

  const commitDraft = (valStr: string) => {
    const parsed = parseInt(valStr.trim(), 10);
    if (isNaN(parsed)) {
      const fallback = clampValue(value || min);
      setDraft(String(fallback));
      onChange(fallback);
      return;
    }
    const clamped = clampValue(parsed);
    setDraft(String(clamped));
    onChange(clamped);
  };

  const handleStep = (direction: 1 | -1) => {
    if (disabled) return;
    const currentVal = parseInt(draft, 10);
    const base = isNaN(currentVal) ? (Number.isFinite(value) ? value : min) : currentVal;
    const nextVal = clampValue(base + direction * step);
    setDraft(String(nextVal));
    onChange(nextVal);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === "ArrowUp") {
      e.preventDefault(); // Prevent unexpected page scrolling
      handleStep(1);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault(); // Prevent unexpected page scrolling
      handleStep(-1);
      return;
    }

    if (e.key === "Home") {
      e.preventDefault();
      setDraft(String(min));
      onChange(min);
      return;
    }

    if (e.key === "End") {
      e.preventDefault();
      setDraft(String(max));
      onChange(max);
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      commitDraft(draft);
      if (onEnter) {
        onEnter();
      }
      return;
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Allow empty string so the user can backspace and type a new number
    if (raw === "") {
      setDraft("");
      return;
    }

    // Filter to integer digits only (supports standard keys and numeric keypad)
    const digitsOnly = raw.replace(/\D/g, "");
    if (digitsOnly === "") {
      setDraft("");
      return;
    }

    const parsed = parseInt(digitsOnly, 10);
    if (!isNaN(parsed)) {
      // If user typed a number strictly above max, clamp immediately to max
      if (parsed > max) {
        setDraft(String(max));
        onChange(max);
      } else {
        setDraft(digitsOnly);
        onChange(parsed);
      }
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    commitDraft(draft);
  };

  return (
    <div className="rounded border border-plant-line bg-plant-void p-3 transition-colors focus-within:border-plant-cyan/70">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-[10px] font-semibold uppercase tracking-wider text-plant-muted">
          {label}
        </label>
        <span className="text-[9px] font-mono text-plant-muted">
          {min}–{max} {unit}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <div className="relative flex flex-1 items-center rounded border border-plant-line bg-plant-deck focus-within:border-plant-cyan">
          <input
            id={id}
            type="number"
            inputMode="numeric"
            step={step}
            min={min}
            max={max}
            disabled={disabled}
            className="h-10 w-full bg-transparent px-3 font-mono text-base font-bold text-plant-text outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            value={draft}
            placeholder={placeholder}
            onFocus={() => setIsFocused(true)}
            onBlur={handleBlur}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
          />
          <div className="flex flex-col border-l border-plant-line/60">
            <button
              type="button"
              tabIndex={-1}
              aria-label={`Increment ${label}`}
              onClick={() => handleStep(1)}
              disabled={disabled || (parseInt(draft, 10) >= max)}
              className="flex h-5 w-6 items-center justify-center text-plant-muted hover:bg-plant-cyan/15 hover:text-plant-cyan disabled:opacity-30 transition"
            >
              <ChevronUp className="h-3 w-3" />
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-label={`Decrement ${label}`}
              onClick={() => handleStep(-1)}
              disabled={disabled || (parseInt(draft, 10) <= min)}
              className="flex h-5 w-6 items-center justify-center border-t border-plant-line/60 text-plant-muted hover:bg-plant-cyan/15 hover:text-plant-cyan disabled:opacity-30 transition"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
          </div>
        </div>
        <span className="min-w-[24px] text-xs font-bold text-plant-cyan">{unit}</span>
      </div>
    </div>
  );
};
