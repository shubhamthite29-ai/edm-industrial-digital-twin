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
  decimals?: number;
  allowDecimals?: boolean;
  placeholder?: string;
  onChange: (value: number) => void;
  onEnter?: () => void;
  disabled?: boolean;
}

const decimalPattern = /^-?(?:\d+(?:\.\d*)?|\.\d*)?$/;

function formatVal(value: number, allowDecimals: boolean, decimals?: number): string {
  if (!Number.isFinite(value)) return "";
  if (allowDecimals || (decimals !== undefined && decimals > 0)) {
    const d = decimals ?? 2;
    return Number(value.toFixed(d)).toString();
  }
  return String(Math.round(value));
}

export const IntegerParameterInput: React.FC<IntegerParameterInputProps> = ({
  id,
  label,
  unit,
  value,
  min,
  max,
  step = 1,
  decimals,
  allowDecimals = false,
  placeholder,
  onChange,
  onEnter,
  disabled = false,
}) => {
  const supportsDecimals = allowDecimals || step < 1 || (decimals !== undefined && decimals > 0);
  const [draft, setDraft] = useState<string>(() => formatVal(value, supportsDecimals, decimals));
  const [isFocused, setIsFocused] = useState<boolean>(false);

  // Sync draft when external value changes while not editing
  useEffect(() => {
    if (!isFocused && Number.isFinite(value)) {
      setDraft(formatVal(value, supportsDecimals, decimals));
    }
  }, [value, isFocused, supportsDecimals, decimals]);

  const clampValue = (val: number): number => {
    if (supportsDecimals) {
      const d = decimals ?? (step < 1 ? 2 : 1);
      return Number(Math.max(min, Math.min(max, val)).toFixed(d));
    }
    return Math.max(min, Math.min(max, Math.round(val)));
  };

  const commitDraft = (valStr: string) => {
    setIsFocused(false);
    const cleaned = valStr.trim().replace(",", ".");
    const parsed = supportsDecimals ? parseFloat(cleaned) : parseInt(cleaned, 10);
    if (isNaN(parsed) || !Number.isFinite(parsed)) {
      const fallback = clampValue(Number.isFinite(value) ? value : min);
      setDraft(formatVal(fallback, supportsDecimals, decimals));
      onChange(fallback);
      return;
    }
    const clamped = clampValue(parsed);
    setDraft(formatVal(clamped, supportsDecimals, decimals));
    onChange(clamped);
  };

  const handleStep = (direction: 1 | -1) => {
    if (disabled) return;
    const cleaned = draft.trim().replace(",", ".");
    const currentVal = supportsDecimals ? parseFloat(cleaned) : parseInt(cleaned, 10);
    const base = isNaN(currentVal) ? (Number.isFinite(value) ? value : min) : currentVal;
    const nextVal = clampValue(base + direction * step);
    setDraft(formatVal(nextVal, supportsDecimals, decimals));
    onChange(nextVal);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === "ArrowUp") {
      e.preventDefault();
      handleStep(1);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      handleStep(-1);
      return;
    }

    if (e.key === "Home") {
      e.preventDefault();
      setDraft(formatVal(min, supportsDecimals, decimals));
      onChange(min);
      return;
    }

    if (e.key === "End") {
      e.preventDefault();
      setDraft(formatVal(max, supportsDecimals, decimals));
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
    const raw = e.target.value.replace(",", ".");
    // Allow empty string or negative sign so user can backspace, delete, or re-type
    if (raw === "" || raw === "-") {
      setDraft(raw);
      return;
    }

    // Only allow valid numeric / decimal keystrokes
    if (!decimalPattern.test(raw)) {
      return;
    }

    setDraft(raw);

    // If fully parses to a finite number, propagate live update without destructive clamping
    const parsed = supportsDecimals ? parseFloat(raw) : parseInt(raw, 10);
    if (!isNaN(parsed) && Number.isFinite(parsed)) {
      // Propagate live change if within reasonable span
      onChange(parsed);
    }
  };

  const handleBlur = () => {
    commitDraft(draft);
  };

  // Slider position tracking
  const currentNumeric = parseFloat(draft.replace(",", "."));
  const sliderPosition = Number.isFinite(currentNumeric) ? Math.max(min, Math.min(max, currentNumeric)) : value;

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
            type="text"
            inputMode={supportsDecimals ? "decimal" : "numeric"}
            autoComplete="off"
            disabled={disabled}
            className="h-10 w-full bg-transparent px-3 font-mono text-sm sm:text-base font-bold text-plant-text outline-none"
            value={draft}
            placeholder={placeholder}
            onFocus={(e) => {
              setIsFocused(true);
              e.target.select();
            }}
            onBlur={handleBlur}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            aria-label={`${label} in ${unit}`}
          />
          <div className="flex flex-col border-l border-plant-line/60">
            <button
              type="button"
              tabIndex={-1}
              aria-label={`Increment ${label}`}
              onClick={() => handleStep(1)}
              disabled={disabled || (parseFloat(draft) >= max)}
              className="flex h-5 w-7 items-center justify-center text-plant-muted hover:bg-plant-cyan/15 hover:text-plant-cyan disabled:opacity-30 transition active:scale-95"
            >
              <ChevronUp className="h-3 w-3" />
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-label={`Decrement ${label}`}
              onClick={() => handleStep(-1)}
              disabled={disabled || (parseFloat(draft) <= min)}
              className="flex h-5 w-7 items-center justify-center border-t border-plant-line/60 text-plant-muted hover:bg-plant-cyan/15 hover:text-plant-cyan disabled:opacity-30 transition active:scale-95"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
          </div>
        </div>
        <span className="min-w-[24px] text-xs font-bold text-plant-cyan">{unit}</span>
      </div>

      {/* Synchronized range slider */}
      <div className="mt-2 flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={sliderPosition}
          disabled={disabled}
          onChange={(e) => {
            const nextVal = clampValue(parseFloat(e.target.value));
            setDraft(formatVal(nextVal, supportsDecimals, decimals));
            onChange(nextVal);
          }}
          className="h-1.5 w-full cursor-pointer appearance-none rounded bg-plant-line accent-plant-cyan"
          aria-label={`${label} slider control`}
        />
      </div>
    </div>
  );
};
