import { realtimeClient, type GatewayMessage } from "../Realtime/RealtimeClient";
import { useToolheadStore } from "../store/useToolheadStore";
import { SIMULATION_CALIBRATION, clampSimulationSpeedMmPerSec, clampToolheadPosition, type ToolheadDirection, type ToolheadMotion, type ToolheadPhysicalState, type ToolheadPositionSource } from "../toolhead/toolheadTypes";

let initialized = false;
let simulationTimer: number | null = null;
let lastSimulationTick = 0;
let physicalTelemetryTimer: number | null = null;
const PHYSICAL_TELEMETRY_STALE_MS = 3000;

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function directionValue(value: unknown): ToolheadDirection | undefined {
  return value === "UP" || value === "DOWN" || value === "STOPPED" ? value : undefined;
}

function motionValue(value: unknown): ToolheadMotion | undefined {
  return value === "MOVING" || value === "STOPPED" || value === "ERROR" ? value : undefined;
}

function positionSource(value: unknown): ToolheadPositionSource | undefined {
  return value === "simulation" || value === "servo_estimate" || value === "linear_feedback" ? value : undefined;
}

function physicalStateValue(value: unknown): ToolheadPhysicalState | undefined {
  return value === "CALIBRATION_REQUIRED" || value === "READY" || value === "MOVING" || value === "STOPPED" || value === "ERROR" ? value : undefined;
}

function isValidControllerState(payload: Record<string, unknown>) {
  const controller = payload.controller;
  const chip = payload.chip;
  const positionMm = numberValue(payload.position_mm);
  const targetPositionMm = numberValue(payload.target_position_mm);
  const minimum = numberValue(payload.min_position_mm);
  const maximum = numberValue(payload.max_position_mm);
  return controller === "ESP32-WROOM-32" && chip === "ESP32-D0WD-V3" &&
    payload.protocol === "toolhead-json" && payload.transport === "usb_serial" &&
    positionMm !== undefined && targetPositionMm !== undefined &&
    minimum !== undefined && maximum !== undefined && minimum < maximum &&
    positionMm >= minimum && positionMm <= maximum &&
    targetPositionMm >= minimum && targetPositionMm <= maximum &&
    physicalStateValue(payload.physical_state) !== undefined;
}

function stopSimulation() {
  if (simulationTimer !== null) window.clearInterval(simulationTimer);
  simulationTimer = null;
}

function resetPhysicalTelemetryTimeout() {
  if (physicalTelemetryTimer !== null) window.clearTimeout(physicalTelemetryTimer);
  physicalTelemetryTimer = window.setTimeout(() => {
    physicalTelemetryTimer = null;
    const state = useToolheadStore.getState();
    if (state.mode === "physical") state.setConnection(false);
  }, PHYSICAL_TELEMETRY_STALE_MS);
}

function runSimulation(direction: ToolheadDirection, targetPositionMm: number) {
  stopSimulation();
  const store = useToolheadStore.getState();
  store.setSimulationMotion(direction, "MOVING", targetPositionMm);
  lastSimulationTick = performance.now();
  simulationTimer = window.setInterval(() => {
    const state = useToolheadStore.getState();
    const now = performance.now();
    const movement = state.simulationSpeedMmPerSec * ((now - lastSimulationTick) / 1000);
    lastSimulationTick = now;
    const sign = targetPositionMm >= state.positionMm ? 1 : -1;
    const next = clampToolheadPosition(state.positionMm + sign * movement, SIMULATION_CALIBRATION);
    const arrived = sign > 0 ? next >= targetPositionMm : next <= targetPositionMm;
    state.applyTelemetry({
      positionMm: arrived ? targetPositionMm : next,
      targetPositionMm,
      direction: arrived ? "STOPPED" : direction,
      motion: arrived ? "STOPPED" : "MOVING",
      lastStateAt: new Date().toISOString(),
      calibration: SIMULATION_CALIBRATION,
    });
    if (arrived) stopSimulation();
  }, 50);
}

function sendPhysical(type: string, payload: Record<string, unknown>) {
  const state = useToolheadStore.getState();
  if (!state.esp32Connected) {
    state.setError("ESP32 controller is not connected.");
    return false;
  }
  const sent = realtimeClient.send({ type, payload });
  if (!sent) state.setError("Toolhead command could not be sent to the gateway.");
  return sent;
}

function handleToolheadState(payload: Record<string, unknown>, receivedAt?: string) {
  if (!isValidControllerState(payload)) return;
  const store = useToolheadStore.getState();
  store.setConnection(true);
  resetPhysicalTelemetryTimeout();

  // Simulation retains authority until the operator explicitly selects the
  // physical controller. The ESP32 continues publishing in the background.
  if (store.mode !== "physical") return;

  console.log(`[toolhead] telemetry @ ${receivedAt ?? new Date().toISOString()} pos=${payload.position_mm} target=${payload.target_position_mm} motion=${payload.motion}`);

  const minPositionMm = numberValue(payload.min_position_mm);
  const maxPositionMm = numberValue(payload.max_position_mm);
  const source = positionSource(payload.position_source);
  store.applyTelemetry({
    positionMm: numberValue(payload.position_mm),
    targetPositionMm: numberValue(payload.target_position_mm),
    simulationSpeedMmPerSec: numberValue(payload.speed_mm_per_sec),
    controllerName: typeof payload.controller === "string" ? payload.controller : undefined,
    controllerChip: typeof payload.chip === "string" ? payload.chip : undefined,
    controllerPort: typeof payload.port === "string" ? payload.port : undefined,
    controllerTransport: typeof payload.transport === "string" ? payload.transport : undefined,
    servoAngle: numberValue(payload.servo_angle),
    direction: directionValue(payload.direction),
    motion: motionValue(payload.motion),
    physicalState: physicalStateValue(payload.physical_state),
    lastStateAt: receivedAt ?? (typeof payload.timestamp === "string" ? payload.timestamp : new Date().toISOString()),
    error: typeof payload.error === "string" ? payload.error : null,
    calibration: minPositionMm !== undefined && maxPositionMm !== undefined ? {
      minPositionMm,
      maxPositionMm,
      servoMinDeg: numberValue(payload.servo_top_angle_deg) ?? numberValue(payload.servo_min_deg) ?? null,
      servoMaxDeg: numberValue(payload.servo_low_angle_deg) ?? numberValue(payload.servo_max_deg) ?? null,
      calibrated: payload.calibrated === true,
      servoArmed: payload.servo_armed === true,
      calibrationSessionAvailable: payload.calibration_session_available === true,
      calibrationSessionActive: payload.calibration_session_active === true,
      calibrationStepMaxDeg: numberValue(payload.calibration_step_max_deg) ?? null,
      topMarked: payload.top_marked === true,
      lowMarked: payload.low_marked === true,
      servoDirection: payload.servo_direction === -1 || payload.servo_direction === 1 ? payload.servo_direction : 0,
      positionSource: source ?? "servo_estimate",
    } : undefined,
  });
}

export function initializeToolheadService() {
  if (initialized) return;
  initialized = true;
  realtimeClient.onMessage((message: GatewayMessage) => {
    if (message.type === "toolhead.state" && message.payload) handleToolheadState(message.payload, message.timestamp);
    if (message.type === "client.status" && message.payload?.role === "esp32" && message.payload.status === "disconnected") {
      // Role registration only proves that a bridge socket exists. A physical
      // connection is declared exclusively after a fresh toolhead.state packet.
      useToolheadStore.getState().setConnection(false);
    }
  });
}

export function setToolheadMode(mode: "simulation" | "physical") {
  stopSimulation();
  const state = useToolheadStore.getState();
  state.setMode(mode);
  if (mode === "physical") {
    // Require a new state packet after every transition into physical mode.
    // This prevents stale simulation-era state from being treated as hardware.
    state.setConnection(false);
    requestPhysicalToolheadStatus();
  }
}

export function requestPhysicalToolheadStatus() {
  const state = useToolheadStore.getState();
  const pingSent = realtimeClient.send({ type: "toolhead.command", payload: { command: "PING" } });
  const stateSent = realtimeClient.send({ type: "toolhead.command", payload: { command: "GET_STATE" } });
  if (!pingSent && !stateSent) state.setError("Gateway connection is unavailable; unable to request ESP32 state.");
  return pingSent || stateSent;
}

function sendCalibration(action: string, payload: Record<string, unknown> = {}) {
  return sendPhysical("toolhead.calibration", { action, ...payload });
}

export function beginToolheadCalibration() {
  return sendCalibration("BEGIN");
}

export function stepToolheadCalibration(deltaDeg: number) {
  return sendCalibration("STEP", { delta_deg: deltaDeg });
}

export function markToolheadCalibrationTop() {
  return sendCalibration("MARK_TOP");
}

export function markToolheadCalibrationLow() {
  return sendCalibration("MARK_LOW");
}

export function commitToolheadCalibration() {
  return sendCalibration("COMMIT");
}

export function cancelToolheadCalibration() {
  return sendCalibration("CANCEL");
}

export function armToolheadController() {
  return sendCalibration("ARM");
}

// Incremental step size for UP/DOWN button presses.
// Each click moves 20 mm toward the limit (clamped to the calibrated range).
const STEP_MM = 20;

export function moveToolheadUp() {
  const state = useToolheadStore.getState();
  if (state.mode === "simulation") {
    runSimulation("UP", SIMULATION_CALIBRATION.minPositionMm);
    return true;
  }
  const calibration = state.calibration;
  // If moving, increment from the current target. If stopped, increment from current position.
  const basePosition = state.motion === "MOVING" ? state.targetPositionMm : state.positionMm;
  const nextTarget = Math.max(calibration.minPositionMm, basePosition - STEP_MM);
  state.applyTelemetry({ targetPositionMm: nextTarget, direction: "UP", motion: "MOVING" });
  console.log(`[toolhead] UP click → set_position ${nextTarget.toFixed(1)} mm @ ${new Date().toISOString()}`);
  return sendPhysical("toolhead.set_position", { position_mm: nextTarget });
}

export function moveToolheadDown() {
  const state = useToolheadStore.getState();
  if (state.mode === "simulation") {
    runSimulation("DOWN", SIMULATION_CALIBRATION.maxPositionMm);
    return true;
  }
  const calibration = state.calibration;
  const basePosition = state.motion === "MOVING" ? state.targetPositionMm : state.positionMm;
  const nextTarget = Math.min(calibration.maxPositionMm, basePosition + STEP_MM);
  state.applyTelemetry({ targetPositionMm: nextTarget, direction: "DOWN", motion: "MOVING" });
  console.log(`[toolhead] DOWN click → set_position ${nextTarget.toFixed(1)} mm @ ${new Date().toISOString()}`);
  return sendPhysical("toolhead.set_position", { position_mm: nextTarget });
}

export function stopToolhead() {
  const state = useToolheadStore.getState();
  if (state.mode === "simulation") {
    stopSimulation();
    state.applyTelemetry({ direction: "STOPPED", motion: "STOPPED", targetPositionMm: state.positionMm, calibration: SIMULATION_CALIBRATION });
    return true;
  }
  // Optimistic STOP: immediately freeze displayed state at current position.
  state.applyTelemetry({ direction: "STOPPED", motion: "STOPPED", targetPositionMm: state.positionMm });
  console.log(`[toolhead] STOP click @ ${new Date().toISOString()}`);
  return sendPhysical("toolhead.command", { command: "STOP" });
}

export function setToolheadPosition(positionMm: number) {
  const state = useToolheadStore.getState();
  if (!Number.isFinite(positionMm)) {
    state.setError("Toolhead position must be a finite millimetre value.");
    return false;
  }
  const calibration = state.mode === "simulation" ? SIMULATION_CALIBRATION : state.calibration;
  const clampedPositionMm = clampToolheadPosition(positionMm, calibration);
  if (clampedPositionMm !== positionMm) {
    state.setError(`Position clamped to ${clampedPositionMm} mm. Allowed range: ${calibration.minPositionMm}-${calibration.maxPositionMm} mm.`);
  }
  if (state.mode === "simulation") {
    runSimulation(clampedPositionMm <= state.positionMm ? "UP" : "DOWN", clampedPositionMm);
    return true;
  }
  const dir = clampedPositionMm < state.positionMm ? "UP" : "DOWN";
  state.applyTelemetry({ targetPositionMm: clampedPositionMm, direction: dir, motion: "MOVING" });
  console.log(`[toolhead] SET_POSITION ${clampedPositionMm.toFixed(1)} mm @ ${new Date().toISOString()}`);
  return sendPhysical("toolhead.set_position", { position_mm: clampedPositionMm });
}

export function setToolheadSpeed(speedMmPerSec: number) {
  if (!Number.isFinite(speedMmPerSec)) {
    useToolheadStore.getState().setError("Toolhead speed must be a finite millimetres-per-second value.");
    return false;
  }

  const speed = clampSimulationSpeedMmPerSec(speedMmPerSec);
  const state = useToolheadStore.getState();
  if (state.mode === "simulation") {
    state.setSimulationSpeed(speed);
    return true;
  }

  const sent = sendPhysical("toolhead.set_speed", { speed_mm_per_sec: speed });
  if (sent) state.setSimulationSpeed(speed);
  return sent;
}
