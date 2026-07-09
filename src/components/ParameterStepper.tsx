import { ChevronDown, ChevronUp } from "lucide-react";
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

export function ParameterStepper({ id, label, unit, min, max, step, decimals = 1 }: ParameterStepperProps) {
  const value = useTwinStore((state) => state.pendingParameters[id]);
  const updatePendingParameter = useTwinStore((state) => state.updatePendingParameter);
  const incrementPendingParameter = useTwinStore((state) => state.incrementPendingParameter);
  const numericValue = Number(value);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_124px] items-center gap-3 rounded border border-plant-line bg-plant-deck p-3">
      <div className="min-w-0">
        <div className="truncate text-xs font-semibold uppercase tracking-wide text-plant-text">{label}</div>
        <div className="mt-1 text-[11px] text-plant-muted">
          {min} to {max} {unit}
        </div>
      </div>
      <div className="grid grid-cols-[34px_1fr_34px] items-center rounded border border-plant-line bg-plant-void">
        <button
          type="button"
          className="flex h-10 items-center justify-center text-plant-cyan hover:bg-plant-cyan/10"
          onClick={() => incrementPendingParameter(id, -step)}
          aria-label={`Decrease ${label}`}
        >
          <ChevronDown size={16} />
        </button>
        <input
          className="h-10 min-w-0 border-x border-plant-line bg-transparent px-1 text-center font-mono text-sm text-plant-text outline-none"
          type="number"
          min={min}
          max={max}
          step={step}
          value={Number(numericValue.toFixed(decimals))}
          onChange={(event) => updatePendingParameter(id, Number(event.target.value) as MachineParameters[typeof id])}
        />
        <button
          type="button"
          className="flex h-10 items-center justify-center text-plant-cyan hover:bg-plant-cyan/10"
          onClick={() => incrementPendingParameter(id, step)}
          aria-label={`Increase ${label}`}
        >
          <ChevronUp size={16} />
        </button>
      </div>
    </div>
  );
}
