import type { MachineParameters, UnityTelemetry } from "../types/twin";

export interface MachineCommandEnvelope {
  command: "start" | "stop" | "reset" | "home" | "emergency_stop" | "pause" | "resume" | "request_status";
  issuedBy?: string;
}

export interface MachineDataAdapter {
  readonly name: string;
  connect(): Promise<void> | void;
  disconnect(): Promise<void> | void;
  sendCommand(command: MachineCommandEnvelope): boolean | Promise<boolean>;
  sendParameters(parameters: MachineParameters): boolean | Promise<boolean>;
  onTelemetry(handler: (telemetry: UnityTelemetry) => void): () => void;
}

export interface SensorAdapterSample {
  source: "unity" | "simulation" | "esp32" | "plc" | "mqtt" | "modbus" | "opcua";
  timestamp: string;
  parameters?: Partial<MachineParameters>;
  telemetry?: Partial<UnityTelemetry>;
}
