import { machineCommandService } from "../Machine/MachineCommandService";
import { realtimeClient, type GatewayMessage } from "../Realtime/RealtimeClient";
import { useTwinStore } from "../store/useTwinStore";

let initialized = false;

function normalizeUnityStatus(status: unknown) {
  if (typeof status !== "string") return null;
  const normalized = status.trim().toLowerCase();
  if (normalized === "machining") return "Machining" as const;
  if (normalized === "idle") return "Idle" as const;
  return null;
}

function handleMessage(message: GatewayMessage) {
  if (message.type !== "unity.state") return;

  const status = normalizeUnityStatus(message.payload?.status);
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

export function emergencyStopLiveMachine() {
  const sent = machineCommandService.emergencyStop();
  if (sent) {
    useTwinStore.getState().setMachineStatus("Idle");
  }
  return sent;
}
