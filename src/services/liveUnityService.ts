import { machineCommandService } from "../Machine/MachineCommandService";
import { cameraCommandService } from "../Machine/CameraCommandService";
import { realtimeClient, type GatewayMessage } from "../Realtime/RealtimeClient";
import { useTwinStore } from "../store/useTwinStore";
import { onUnityWebGLReadyChange } from "./unityWebGLBridge";
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
    "READY",
    "STARTING",
    "MACHINING",
    "PAUSED",
    "STOPPED",
    "HOMING",
    "RESETTING",
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
  if (state.dataMode === "dataset") return;

  const status = normalizeUnityStatus(message.payload?.status);

  const machineState = normalizeMachineState(message.payload?.machineState ?? message.payload?.state);
  const previousTelemetry = state.unityTelemetry;
  const telemetry = {
    machineState: machineState ?? previousTelemetry.machineState,
    cyclePercent: numberFromPayload(message.payload?.cyclePercent) ?? previousTelemetry.cyclePercent,
    progressPercent: numberFromPayload(message.payload?.progressPercent ?? message.payload?.progress) ?? previousTelemetry.progressPercent,
    toolPosition: numberFromPayload(message.payload?.toolPosition) ?? previousTelemetry.toolPosition,
    tankPosition: numberFromPayload(message.payload?.tankPosition) ?? previousTelemetry.tankPosition,
    sparkActive: booleanFromPayload(message.payload?.sparkActive) ?? previousTelemetry.sparkActive,
    machineTimeSeconds: numberFromPayload(message.payload?.machineTimeSeconds) ?? previousTelemetry.machineTimeSeconds,
    elapsedTimeSeconds: numberFromPayload(message.payload?.elapsedTimeSeconds ?? message.payload?.elapsedTime) ?? previousTelemetry.elapsedTimeSeconds,
    remainingTimeSeconds: numberFromPayload(message.payload?.remainingTimeSeconds ?? message.payload?.remainingTime) ?? previousTelemetry.remainingTimeSeconds,
  };

  const parameters: Partial<MachineParameters> = {};
  const currentA = numberFromPayload(message.payload?.currentA);
  const voltageV = numberFromPayload(message.payload?.voltageV);
  const gapVoltageV = numberFromPayload(message.payload?.gapVoltageV);
  const pulseOnUs = numberFromPayload(message.payload?.pulseOnUs);
  const pulseOffUs = numberFromPayload(message.payload?.pulseOffUs);
  const gapDistanceMm = numberFromPayload(message.payload?.gapDistanceMm);
  const servoFeedPercent = numberFromPayload(message.payload?.servoFeedPercent);
  const flushingPressureBar = numberFromPayload(message.payload?.flushingPressureBar);
  const flowRateLpm = numberFromPayload(message.payload?.flowRateLpm);
  const conductivityUsCm = numberFromPayload(message.payload?.conductivityUsCm);
  const openCircuitVoltageV = numberFromPayload(message.payload?.openCircuitVoltageV);
  const toolDiameterMm = numberFromPayload(message.payload?.toolDiameterMm);
  const depthOfCutMm = numberFromPayload(message.payload?.depthOfCutMm);
  const hasCompleteParameterEcho =
    gapDistanceMm !== undefined ||
    servoFeedPercent !== undefined ||
    flushingPressureBar !== undefined ||
    flowRateLpm !== undefined ||
    conductivityUsCm !== undefined ||
    openCircuitVoltageV !== undefined ||
    toolDiameterMm !== undefined ||
    depthOfCutMm !== undefined;

  if (hasCompleteParameterEcho) {
    if (currentA !== undefined) parameters.current = currentA;
    if (voltageV !== undefined) parameters.voltage = voltageV;
    if (gapVoltageV !== undefined) parameters.gapVoltage = gapVoltageV;
    if (pulseOnUs !== undefined) parameters.pulseOn = pulseOnUs;
    if (pulseOffUs !== undefined) parameters.pulseOff = pulseOffUs;
    if (gapDistanceMm !== undefined) parameters.gapDistance = gapDistanceMm;
    if (servoFeedPercent !== undefined) parameters.servoFeed = servoFeedPercent;
    if (flushingPressureBar !== undefined) parameters.pressure = flushingPressureBar;
    if (flowRateLpm !== undefined) parameters.flowRate = flowRateLpm;
    if (conductivityUsCm !== undefined) parameters.conductivity = conductivityUsCm;
    if (openCircuitVoltageV !== undefined) parameters.openCircuitVoltage = openCircuitVoltageV;
    if (toolDiameterMm !== undefined) parameters.toolDiameter = toolDiameterMm;
    if (depthOfCutMm !== undefined) parameters.depthOfCut = depthOfCutMm;
  }

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

  if (machineState && machineState !== previousTelemetry.machineState) {
    useTwinStore.getState().addEvent(machineState === "EMERGENCY_STOP" ? "EMERGENCY" : "INFO", "SYSTEM", `Unity machine state changed to ${machineState}.`);
    useTwinStore.getState().pushNotification(machineState === "EMERGENCY_STOP" ? "EMERGENCY" : "INFO", `Machine ${machineState}`);
  }
}

export function initializeLiveUnityService() {
  if (initialized) return;
  initialized = true;

  onUnityWebGLReadyChange((ready) => {
    useTwinStore.getState().setUnityWebGLReady(ready);
  });

  realtimeClient.onStatusChange((status) => {
    useTwinStore.getState().setConnectionStatus(status);
    if (status === "connected") {
      machineCommandService.requestStatus();
    }
  });

  realtimeClient.onDiagnostics((diagnostics) => {
    useTwinStore.getState().setRealtimeDiagnostics(diagnostics);
  });

  realtimeClient.onMessage(handleMessage);
  realtimeClient.onMessage((message) => {
    if (message.type === "client.status") {
      const role = typeof message.payload?.role === "string" ? message.payload.role : "client";
      const status = typeof message.payload?.status === "string" ? message.payload.status : "updated";
      useTwinStore.getState().addEvent("INFO", "CONNECTION", `${role} ${status}.`);
    }
  });
  realtimeClient.connect();
}

function sendLiveMessage(message: GatewayMessage) {
  return realtimeClient.getStatus() === "connected" && realtimeClient.send(message);
}

function sendMachineCommand(command: string) {
  return sendLiveMessage({
    type: "machine.command",
    payload: {
      command,
    },
  });
}

export function startLiveMachining() {
  const sent = sendMachineCommand("start") || machineCommandService.startMachining();
  if (sent) {
    useTwinStore.getState().setMachineStatus("Machining");
    useTwinStore.getState().addEvent("INFO", "COMMAND", "Machine Start command sent.");
    useTwinStore.getState().pushNotification("INFO", "Machine Started");
  }
  return sent;
}

export function stopLiveMachining() {
  const sent = sendMachineCommand("stop") || machineCommandService.stopMachining();
  if (sent) {
    useTwinStore.getState().setMachineStatus("Idle");
    useTwinStore.getState().addEvent("INFO", "COMMAND", "Machine Stop command sent.");
    useTwinStore.getState().pushNotification("INFO", "Machine Stopped");
  }
  return sent;
}

export function resetLiveMachine() {
  const sent = sendMachineCommand("reset") || machineCommandService.resetMachine();
  if (sent) {
    useTwinStore.getState().setMachineStatus("Idle");
    useTwinStore.getState().addEvent("INFO", "COMMAND", "Machine Reset command sent.");
    useTwinStore.getState().pushNotification("INFO", "Machine Reset");
  }
  return sent;
}

export function homeLiveMachine() {
  const sent = sendMachineCommand("home") || machineCommandService.homeMachine();
  if (sent) useTwinStore.getState().addEvent("INFO", "COMMAND", "Machine Home command sent.");
  return sent;
}

export function emergencyStopLiveMachine() {
  const sent = sendMachineCommand("emergency_stop") || machineCommandService.emergencyStop();
  if (sent) {
    useTwinStore.getState().setMachineStatus("Idle");
    useTwinStore.getState().addEvent("EMERGENCY", "COMMAND", "Emergency Stop command sent.");
    useTwinStore.getState().pushNotification("EMERGENCY", "Emergency Stop");
  }
  return sent;
}

export function pauseLiveMachine() {
  const sent = sendMachineCommand("pause") || machineCommandService.pauseMachining();
  if (sent) {
    useTwinStore.getState().addEvent("INFO", "COMMAND", "Machine Pause command sent.");
    useTwinStore.getState().pushNotification("INFO", "Machine Paused");
  }
  return sent;
}

export function resumeLiveMachine() {
  const sent = sendMachineCommand("resume") || machineCommandService.resumeMachining();
  if (sent) {
    useTwinStore.getState().addEvent("INFO", "COMMAND", "Machine Resume command sent.");
    useTwinStore.getState().pushNotification("INFO", "Machine Resumed");
  }
  return sent;
}

export function requestLiveStatus() {
  return sendMachineCommand("request_status") || machineCommandService.requestStatus();
}

export function pingGateway() {
  return realtimeClient.ping();
}

export function setLiveCameraView(view: CameraView) {
  useTwinStore.getState().setCameraView(view);
  const sent = sendLiveMessage({
    type: "camera.command",
    payload: {
      view,
    },
  });
  return sent || cameraCommandService.setView(view);
}
