import { realtimeClient, type GatewayMessage, type RealtimeClient } from "../Realtime/RealtimeClient";
import type { MachineParameters } from "../types/twin";

export interface MachineParametersPatchPayload {
  [key: string]: number;
  currentA: number;
  voltageV: number;
  gapVoltageV: number;
  pulseOnUs: number;
  pulseOffUs: number;
}

export class MachineParameterService {
  constructor(private readonly client: RealtimeClient = realtimeClient) {}

  applyParameters(parameters: MachineParameters) {
    const payload: MachineParametersPatchPayload = {
      currentA: parameters.current,
      voltageV: parameters.voltage,
      gapVoltageV: parameters.voltage,
      pulseOnUs: parameters.pulseOn,
      pulseOffUs: parameters.pulseOff,
    };

    return this.sendPatch(payload);
  }

  sendPatch(payload: MachineParametersPatchPayload) {
    const message: GatewayMessage = {
      type: "machine.parameters.patch",
      payload,
    };

    return this.client.send(message);
  }
}

export const machineParameterService = new MachineParameterService();
