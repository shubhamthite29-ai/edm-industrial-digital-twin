export type SensorGroup = "ELECTRICAL" | "MECHANICAL" | "DIELECTRIC" | "THERMAL" | "ACOUSTIC/OPTICAL";

export interface SensorSpec {
  id: string;
  group: SensorGroup;
  groupColor: string;
  name: string;
  model: string;
  parameter: string;
  range: string;
  accuracy: string;
  sampleRate: string;
  protocol: string;
  location: string;
  installTip: string;
  purpose: string;
  x: number;
  y: number;
  zone: string;
  mvp?: boolean;
}
