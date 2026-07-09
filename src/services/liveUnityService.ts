import { machineCommandService } from "../Machine/MachineCommandService";
import { cameraCommandService } from "../Machine/CameraCommandService";
import { realtimeClient, type GatewayMessage } from "../Realtime/RealtimeClient";
import { useTwinStore } from "../store/useTwinStore";
import type { CameraView, MachineLifecycleState, MachineParameters } from "../types/twin";

let initialized = false;

function normalizeUnityStatus(status: unknown) {
  if (typeof status !== "string") return null;
  const normalized = status.trim().toLowerCase();
  if (normalized === "machining") return "Machining" as const;
  if (normalized === "idle") return "Idle" as const;
  return null;
}

function normalizeMachineState(value: unknown): MachineLifecycleState | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  const states: MachineLifecycleState[] = [
    "BOOTING",
    "READY",
    "WAITING_FOR_PARAMETERS",
    "READY_TO_START",
    "STARTING",
    "POSITIONING_TANK",
    "LOWERING_TOOL",
    "MACHINING",
    "RETRACTING",
    "RETURNING_TANK",
    "COMPLETED",
    "FAULT",
    "EMERGENCY_STOP",
    "OFFLINE",
  ];
  return states.includes(normalized as MachineLifecycleState) ? (normalized as MachineLifecycleState) : null;
}

function numberFromPayload(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanFromPayload(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function handleMessage(message: GatewayMessage) {
  if (message.type !== "unity.state") return;

  const state = useTwinStore.getState();
  const status = normalizeUnityStatus(message.payload?.status);

  const machineState = normalizeMachineState(message.payload?.machineState ?? message.payload?.state);
  const previousTelemetry = state.unityTelemetry;
  const telemetry = {
    machineState: machineState ?? previousTelemetry.machineState,
    cyclePercent: numberFromPayload(message.payload?.cyclePercent) ?? previousTelemetry.cyclePercent,
    toolPosition: numberFromPayload(message.payload?.toolPosition) ?? previousTelemetry.toolPosition,
    tankPosition: numberFromPayload(message.payload?.tankPosition) ?? previousTelemetry.tankPosition,
    sparkActive: booleanFromPayload(message.payload?.sparkActive) ?? previousTelemetry.sparkActive,
    machineTimeSeconds: numberFromPayload(message.payload?.machineTimeSeconds) ?? previousTelemetry.machineTimeSeconds,
  };

  const parameters: Partial<MachineParameters> = {};
  const currentA = numberFromPayload(message.payload?.currentA);
  const voltageV = numberFromPayload(message.payload?.voltageV);
  const gapVoltageV = numberFromPayload(message.payload?.gapVoltageV);
  const pulseOnUs = numberFromPayload(message.payload?.pulseOnUs);
  const pulseOffUs = numberFromPayload(message.payload?.pulseOffUs);

  if (currentA !== undefined) parameters.current = currentA;
  if (voltageV !== undefined) parameters.voltage = voltageV;
  if (gapVoltageV !== undefined) parameters.gapVoltage = gapVoltageV;
  if (pulseOnUs !== undefined) parameters.pulseOn = pulseOnUs;
  if (pulseOffUs !== undefined) parameters.pulseOff = pulseOffUs;

  const temperatureC = numberFromPayload(message.payload?.temperatureC);
  const mrr = numberFromPayload(message.payload?.mrr);
  const toolWear = numberFromPayload(message.payload?.toolWear);

  state.applyLiveTelemetry({
    telemetry,
    parameters: Object.keys(parameters).length ? parameters : undefined,
    metrics: {
      ...(temperatureC !== undefined ? { dielectricTemperature: temperatureC } : {}),
      ...(mrr !== undefined ? { mrr } : {}),
      ...(toolWear !== undefined ? { toolWearRate: toolWear } : {}),
    },
  });

  if (status) {
    useTwinStore.getState().setMachineStatus(status);
  }
}

export function initializeLiveUnityService() {
  if (initialized) return;
  initialized = true;

  realtimeClient.onStatusChange((status) => {
    useTwinStore.getState().setConnectionStatus(status);
  });

  realtimeClient.onDiagnostics((diagnostics) => {
    useTwinStore.getState().setRealtimeDiagnostics(diagnostics);
  });

  realtimeClient.onMessage(handleMessage);
  realtimeClient.connect();
}

export function startLiveMachining() {
  const sent = machineCommandService.startMachining();
  if (sent) {
    useTwinStore.getState().setMachineStatus("Machining");
  }
  return sent;
}

export function stopLiveMachining() {
  const sent = machineCommandService.stopMachining();
  if (sent) {
    useTwinStore.getState().setMachineStatus("Idle");
  }
  return sent;
}

export function resetLiveMachine() {
  const sent = machineCommandService.resetMachine();
  if (sent) {
    useTwinStore.getState().setMachineStatus("Idle");
  }
  return sent;
}

export function homeLiveMachine() {
  return machineCommandService.homeMachine();
}

export function emergencyStopLiveMachine() {
  const sent = machineCommandService.emergencyStop();
  if (sent) {
    useTwinStore.getState().setMachineStatus("Idle");
  }
  return sent;
}

export function pauseLiveMachine() {
  return machineCommandService.pauseMachining();
}

export function resumeLiveMachine() {
  return machineCommandService.resumeMachining();
}

export function requestLiveStatus() {
  return machineCommandService.requestStatus();
}

export function pingGateway() {
  return realtimeClient.ping();
}

export function setLiveCameraView(view: CameraView) {
  return cameraCommandService.setView(view);
}
