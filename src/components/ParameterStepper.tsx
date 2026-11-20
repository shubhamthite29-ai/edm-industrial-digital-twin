import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";
import type { MachineParameters } from "../types/twin";
import { useTwinStore } from "../store/useTwinStore";

interface ParameterStepperProps {
  id: keyof Pick<MachineParameters, "voltage" | "current" | "gapVoltage" | "pulseOn" | "pulseOff" | "gapDistance" | "servoFeed" | "toolDiameter" | "pressure" | "flowRate" | "conductivity" | "openCircuitVoltage" | "depthOfCut">;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  decimals?: number;
}

const editableDecimalPattern = /^-?(?:\d+(?:\.\d*)?|\.\d*)?$/;

function isPartialDecimal(value: string) {
  return value === "" || value === "-" || value === "." || value === "-.";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundToDecimals(value: number, decimals: number) {
  return Number(value.toFixed(decimals));
}

function formatNumber(value: number, decimals: number) {
  if (!Number.isFinite(value)) return "";
  const rounded = value.toFixed(decimals);
  return rounded.replace(/\.?0+$/, "");
}

export function ParameterStepper({ id, label, unit, min, max, step, decimals = 2 }: ParameterStepperProps) {
  const displayDecimals = Math.max(0, decimals);
  const value = useTwinStore((state) => state.pendingParameters[id]);
  const updatePendingParameter = useTwinStore((state) => state.updatePendingParameter);
  const numericValue = Number(value);
  const [draft, setDraft] = useState(() => formatNumber(numericValue, displayDecimals));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(formatNumber(numericValue, displayDecimals));
  }, [displayDecimals, focused, numericValue]);

  const updateFromDraft = (nextDraft: string) => {
    const normalized = nextDraft.replace(",", ".");
    if (!editableDecimalPattern.test(normalized)) return;

    setDraft(normalized);
    if (isPartialDecimal(normalized)) return;

    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      updatePendingParameter(id, parsed as MachineParameters[typeof id]);
    }
  };

  const applyValue = (nextValue: number) => {
    const boundedValue = roundToDecimals(clamp(nextValue, min, max), displayDecimals);
    updatePendingParameter(id, boundedValue as MachineParameters[typeof id]);
    setDraft(formatNumber(boundedValue, displayDecimals));
  };

  const stepValue = (delta: number) => {
    const parsedDraft = Number(draft);
    const baseValue = Number.isFinite(parsedDraft) && !isPartialDecimal(draft) ? parsedDraft : numericValue;
    applyValue(baseValue + delta);
  };

  const commitDraft = () => {
    setFocused(false);
    if (isPartialDecimal(draft)) {
      setDraft(formatNumber(numericValue, displayDecimals));
      return;
    }

    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(formatNumber(numericValue, displayDecimals));
      return;
    }

    // Typed values are deliberately not clamped. The user must be able to enter
    // an out-of-range value, review the warning, and decide whether to apply it.
    updatePendingParameter(id, parsed as MachineParameters[typeof id]);
    setDraft(formatNumber(parsed, displayDecimals));
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_124px] items-center gap-3 rounded border border-plant-line bg-plant-deck p-3">
      <div className="min-w-0">
        <div className="truncate text-xs font-semibold uppercase tracking-wide text-plant-text">{label}</div>
        <div className={`mt-1 text-[11px] ${numericValue < min || numericValue > max ? "text-plant-amber" : "text-plant-muted"}`}>
          {numericValue < min || numericValue > max ? `Outside configured range: ${min} to ${max} ${unit}` : `${min} to ${max} ${unit}`}
        </div>
      </div>
      <div className="grid grid-cols-[34px_1fr_34px] items-center rounded border border-plant-line bg-plant-void">
        <button
          type="button"
          className="flex h-10 items-center justify-center text-plant-cyan hover:bg-plant-cyan/10"
          onClick={() => stepValue(-step)}
          aria-label={`Decrease ${label}`}
        >
          <ChevronDown size={16} />
        </button>
        <input
          className="relative z-10 h-10 min-w-0 cursor-text border-x border-plant-line bg-transparent px-1 text-center font-mono text-sm text-plant-text outline-none"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-label={`${label} (${unit})`}
          value={draft}
          onBlur={commitDraft}
          onChange={(event) => updateFromDraft(event.target.value)}
          onFocus={(event) => {
            setFocused(true);
            event.target.select();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
        <button
          type="button"
          className="flex h-10 items-center justify-center text-plant-cyan hover:bg-plant-cyan/10"
          onClick={() => stepValue(step)}
          aria-label={`Increase ${label}`}
        >
          <ChevronUp size={16} />
        </button>
      </div>
      <div className="col-span-full mt-1">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={clamp(Number.isFinite(numericValue) ? numericValue : min, min, max)}
          onChange={(e) => {
            const nextVal = roundToDecimals(Number(e.target.value), displayDecimals);
            updatePendingParameter(id, nextVal as MachineParameters[typeof id]);
            setDraft(formatNumber(nextVal, displayDecimals));
          }}
          className="h-1.5 w-full cursor-pointer appearance-none rounded bg-plant-line accent-plant-cyan"
          aria-label={`${label} slider control`}
        />
      </div>
    </div>
  );
}
