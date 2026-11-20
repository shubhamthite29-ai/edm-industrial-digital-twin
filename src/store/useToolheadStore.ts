import { create } from "zustand";
import { SIMULATION_CALIBRATION, TOOLHEAD_DEFAULT_SIMULATION_SPEED_MM_PER_SEC, clampSimulationSpeedMmPerSec, clampToolheadPosition, type ToolheadCalibration, type ToolheadDirection, type ToolheadMode, type ToolheadMotion, type ToolheadState } from "../toolhead/toolheadTypes";

interface ToolheadStore extends ToolheadState {
  setMode: (mode: ToolheadMode) => void;
  setConnection: (connected: boolean) => void;
  applyTelemetry: (state: Partial<ToolheadState> & { positionMm?: number }) => void;
  setSimulationMotion: (direction: ToolheadDirection, motion: ToolheadMotion, targetPositionMm: number) => void;
  setSimulationSpeed: (speedMmPerSec: number) => void;
  setError: (message: string | null) => void;
}

function validCalibration(value: Partial<ToolheadCalibration> | undefined, fallback: ToolheadCalibration) {
  const minPositionMm = value?.minPositionMm;
  const maxPositionMm = value?.maxPositionMm;
  if (typeof minPositionMm !== "number" || typeof maxPositionMm !== "number" || !Number.isFinite(minPositionMm) || !Number.isFinite(maxPositionMm) || minPositionMm >= maxPositionMm) return fallback;
  const servoDirection: -1 | 0 | 1 = value?.servoDirection === -1 || value?.servoDirection === 1
    ? value.servoDirection
    : 0;
  return {
    minPositionMm,
    maxPositionMm,
    servoMinDeg: typeof value?.servoMinDeg === "number" && Number.isFinite(value.servoMinDeg) ? value.servoMinDeg : fallback.servoMinDeg,
    servoMaxDeg: typeof value?.servoMaxDeg === "number" && Number.isFinite(value.servoMaxDeg) ? value.servoMaxDeg : fallback.servoMaxDeg,
    calibrated: value?.calibrated === true,
    servoArmed: value?.servoArmed === true,
    calibrationSessionAvailable: value?.calibrationSessionAvailable === true,
    calibrationSessionActive: value?.calibrationSessionActive === true,
    calibrationStepMaxDeg: typeof value?.calibrationStepMaxDeg === "number" && Number.isFinite(value.calibrationStepMaxDeg) ? value.calibrationStepMaxDeg : fallback.calibrationStepMaxDeg,
    topMarked: value?.topMarked === true,
    lowMarked: value?.lowMarked === true,
    servoDirection,
    positionSource: value?.positionSource ?? fallback.positionSource,
  };
}

export const useToolheadStore = create<ToolheadStore>((set) => ({
  mode: "simulation",
  positionMm: SIMULATION_CALIBRATION.minPositionMm,
  targetPositionMm: SIMULATION_CALIBRATION.minPositionMm,
  servoAngle: null,
  direction: "STOPPED",
  motion: "STOPPED",
  physicalState: "SIMULATION",
  esp32Connected: false,
  controllerName: null,
  controllerChip: null,
  controllerPort: null,
  controllerTransport: null,
  lastStateAt: null,
  error: null,
  calibration: SIMULATION_CALIBRATION,
  simulationSpeedMmPerSec: TOOLHEAD_DEFAULT_SIMULATION_SPEED_MM_PER_SEC,
  setMode: (mode) => set((state) => {
    const calibration = mode === "simulation" ? SIMULATION_CALIBRATION : state.calibration;
    return {
      mode,
      calibration,
      positionMm: clampToolheadPosition(state.positionMm, calibration),
      targetPositionMm: clampToolheadPosition(state.targetPositionMm, calibration),
      direction: "STOPPED",
      motion: "STOPPED",
      physicalState: mode === "simulation" ? "SIMULATION" : state.physicalState,
      error: mode === "physical" && !state.esp32Connected ? "ESP32 controller is not connected." : null,
    };
  }),
  setConnection: (esp32Connected) => set((state) => ({
    esp32Connected,
    ...(esp32Connected ? {} : state.mode === "physical" ? { direction: "STOPPED", motion: "ERROR", physicalState: "ERROR", error: "ESP32 connection lost; physical controller must enter its safe state." } : {}),
  })),
  applyTelemetry: (incoming) => set((state) => {
    const calibration = validCalibration(incoming.calibration, state.calibration);
    const positionMm = Number.isFinite(incoming.positionMm) ? clampToolheadPosition(incoming.positionMm!, calibration) : state.positionMm;
    const targetPositionMm = Number.isFinite(incoming.targetPositionMm) ? clampToolheadPosition(incoming.targetPositionMm!, calibration) : positionMm;
    return {
      calibration,
      positionMm,
      targetPositionMm,
      servoAngle: Number.isFinite(incoming.servoAngle) ? incoming.servoAngle! : state.servoAngle,
      controllerName: typeof incoming.controllerName === "string" ? incoming.controllerName : state.controllerName,
      controllerChip: typeof incoming.controllerChip === "string" ? incoming.controllerChip : state.controllerChip,
      controllerPort: typeof incoming.controllerPort === "string" ? incoming.controllerPort : state.controllerPort,
      controllerTransport: typeof incoming.controllerTransport === "string" ? incoming.controllerTransport : state.controllerTransport,
      direction: incoming.direction ?? state.direction,
      motion: incoming.motion ?? state.motion,
      physicalState: incoming.physicalState ?? state.physicalState,
      simulationSpeedMmPerSec: Number.isFinite(incoming.simulationSpeedMmPerSec)
        ? clampSimulationSpeedMmPerSec(incoming.simulationSpeedMmPerSec!)
        : state.simulationSpeedMmPerSec,
      lastStateAt: incoming.lastStateAt ?? new Date().toISOString(),
      error: incoming.error ?? (incoming.motion === "ERROR" ? state.error ?? "Toolhead controller reported an error." : null),
    };
  }),
  setSimulationMotion: (direction, motion, targetPositionMm) => set({
    targetPositionMm: clampToolheadPosition(targetPositionMm, SIMULATION_CALIBRATION),
    direction,
    motion,
    physicalState: "SIMULATION",
    error: null,
  }),
  setSimulationSpeed: (simulationSpeedMmPerSec) => set({ simulationSpeedMmPerSec: clampSimulationSpeedMmPerSec(simulationSpeedMmPerSec) }),
  setError: (error) => set((state) => ({ error, motion: error ? "ERROR" : state.motion })),
}));
