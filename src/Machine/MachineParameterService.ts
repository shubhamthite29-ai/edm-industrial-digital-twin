import { realtimeClient, type GatewayMessage, type RealtimeClient } from "../Realtime/RealtimeClient";
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

    return this.client.send(message);
  }
}

export const machineParameterService = new MachineParameterService();
