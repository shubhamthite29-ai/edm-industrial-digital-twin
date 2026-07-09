import { realtimeClient, type GatewayMessage, type RealtimeClient } from "../Realtime/RealtimeClient";
import { useTwinStore } from "../store/useTwinStore";
import type { MachineParameters } from "../types/twin";

export interface MachineParametersPatchPayload {
  currentA: number;
  voltageV: number;
  gapVoltageV: number;
  pulseOnUs: number;
  pulseOffUs: number;
  servoFeedPercent: number;
  flushingPressureBar: number;
  toolDiameterMm: number;
  workpieceMaterial: string;
  electrodeMaterial: string;
  depthOfCutMm: number;
}

export class MachineParameterService {
  constructor(private readonly client: RealtimeClient = realtimeClient) {}

  applyParameters(parameters: MachineParameters) {
    const payload: MachineParametersPatchPayload = {
      currentA: parameters.current,
      voltageV: parameters.voltage,
      gapVoltageV: parameters.gapVoltage,
      pulseOnUs: parameters.pulseOn,
      pulseOffUs: parameters.pulseOff,
      servoFeedPercent: parameters.servoFeed,
      flushingPressureBar: parameters.pressure,
      toolDiameterMm: parameters.toolDiameter,
      workpieceMaterial: parameters.workpieceMaterial,
      electrodeMaterial: parameters.electrodeMaterial,
      depthOfCutMm: parameters.depthOfCut,
    };

    return this.sendPatch(payload);
  }

  sendPatch(payload: MachineParametersPatchPayload) {
    const message: GatewayMessage = {
      type: "machine.parameters.patch",
      payload: payload as unknown as Record<string, unknown>,
    };

    const sent = this.client.send(message);
    if (sent) {
      useTwinStore.getState().addEvent("INFO", "PARAMETER", `Parameters sent to Unity: ${payload.currentA}A, ${payload.voltageV}V, gap ${payload.gapVoltageV}V.`);
      useTwinStore.getState().pushNotification("INFO", "Parameters Applied");
    }
    return sent;
  }
}

export const machineParameterService = new MachineParameterService();
