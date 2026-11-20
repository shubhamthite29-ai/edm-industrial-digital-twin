export type ToolheadMode = "simulation" | "physical";
export type ToolheadDirection = "UP" | "DOWN" | "STOPPED";
export type ToolheadMotion = "MOVING" | "STOPPED" | "ERROR";
export type ToolheadPositionSource = "simulation" | "servo_estimate" | "linear_feedback";
export type ToolheadPhysicalState = "SIMULATION" | "CALIBRATION_REQUIRED" | "READY" | "MOVING" | "STOPPED" | "ERROR";

export interface ToolheadCalibration {
  minPositionMm: number;
  maxPositionMm: number;
  servoMinDeg: number | null;
  servoMaxDeg: number | null;
  calibrated: boolean;
  servoArmed: boolean;
  calibrationSessionAvailable: boolean;
  calibrationSessionActive: boolean;
  calibrationStepMaxDeg: number | null;
  topMarked: boolean;
  lowMarked: boolean;
  servoDirection: -1 | 0 | 1;
  positionSource: ToolheadPositionSource;
}

export interface ToolheadState {
  mode: ToolheadMode;
  positionMm: number;
  targetPositionMm: number;
  servoAngle: number | null;
  direction: ToolheadDirection;
  motion: ToolheadMotion;
  physicalState: ToolheadPhysicalState;
  esp32Connected: boolean;
  controllerName: string | null;
  controllerChip: string | null;
  controllerPort: string | null;
  controllerTransport: string | null;
  lastStateAt: string | null;
  error: string | null;
  calibration: ToolheadCalibration;
  simulationSpeedMmPerSec: number;
}

export interface ToolheadTelemetry {
  positionMm: number;
  servoAngle?: number | null;
  direction: ToolheadDirection;
  motion: ToolheadMotion;
  positionSource: ToolheadPositionSource;
  calibration?: Partial<ToolheadCalibration>;
  controllerName?: string | null;
  controllerPort?: string | null;
  timestamp?: string;
}

// Browser-only digital envelope. It is never sent to the ESP32 and must not
// be interpreted as a measured physical-servo calibration.
export const TOOLHEAD_MIN_POSITION_MM = 0;
export const TOOLHEAD_MAX_POSITION_MM = 100;
export const TOOLHEAD_MIN_SIMULATION_SPEED_MM_PER_SEC = 1;
export const TOOLHEAD_MAX_SIMULATION_SPEED_MM_PER_SEC = 50;
export const TOOLHEAD_DEFAULT_SIMULATION_SPEED_MM_PER_SEC = 10;

// Canonical convention: 0 mm is the upper safe position and 100 mm is the
// lower base-safe position. Increasing position therefore means moving down.
export const SIMULATION_CALIBRATION: ToolheadCalibration = {
  minPositionMm: TOOLHEAD_MIN_POSITION_MM,
  maxPositionMm: TOOLHEAD_MAX_POSITION_MM,
  servoMinDeg: null,
  servoMaxDeg: null,
  calibrated: false,
  servoArmed: false,
  calibrationSessionAvailable: false,
  calibrationSessionActive: false,
  calibrationStepMaxDeg: null,
  topMarked: false,
  lowMarked: false,
  servoDirection: 0,
  positionSource: "simulation",
};

export function clampToolheadPosition(positionMm: number, calibration: ToolheadCalibration) {
  return Math.min(calibration.maxPositionMm, Math.max(calibration.minPositionMm, positionMm));
}

export function clampSimulationSpeedMmPerSec(speedMmPerSec: number) {
  return Math.min(TOOLHEAD_MAX_SIMULATION_SPEED_MM_PER_SEC, Math.max(TOOLHEAD_MIN_SIMULATION_SPEED_MM_PER_SEC, speedMmPerSec));
}
