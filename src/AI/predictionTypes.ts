import type { DerivedMetrics, MachineParameters, UnityTelemetry } from "../types/twin";

export interface PredictionInput {
  timestamp: string;
  parameters: MachineParameters;
  metrics: DerivedMetrics;
  telemetry: UnityTelemetry;
}

export interface PredictionResult {
  toolLifePercent?: number;
  mrr?: number;
  temperatureC?: number;
  surfaceRoughness?: number;
  faultRiskPercent?: number;
  confidencePercent: number;
  explanation: string;
  recommendedAction?: string;
}

export interface PredictionProvider {
  readonly name: string;
  predict(input: PredictionInput): Promise<PredictionResult>;
}
