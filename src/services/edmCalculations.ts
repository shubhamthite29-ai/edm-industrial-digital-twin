import type { Alarm, DerivedMetrics, GapState, MachineParameters, ValidationResult } from "../types/twin";

const materialConstants = {
  "H13 Steel": { k: 0.125, raScale: 0.023, wear: 0.92, hardness: 1.0 },
  "Titanium Ti-6Al-4V": { k: 0.086, raScale: 0.028, wear: 1.2, hardness: 1.25 },
  "Inconel 718": { k: 0.071, raScale: 0.031, wear: 1.35, hardness: 1.45 },
  "Tool Steel D2": { k: 0.101, raScale: 0.026, wear: 1.08, hardness: 1.15 },
} satisfies Record<MachineParameters["workpieceMaterial"], { k: number; raScale: number; wear: number; hardness: number }>;

const electrodeConstants = {
  Copper: { wearFactor: 0.85, conductivity: 1.0 },
  Graphite: { wearFactor: 0.62, conductivity: 0.74 },
  "Brass Wire": { wearFactor: 1.15, conductivity: 0.58 },
  "Tungsten Copper": { wearFactor: 0.48, conductivity: 0.88 },
} satisfies Record<MachineParameters["electrodeMaterial"], { wearFactor: number; conductivity: number }>;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const defaultParameters: MachineParameters = {
  voltage: 90,
  current: 18,
  pulseOn: 150,
  pulseOff: 45,
  gapDistance: 0.055,
  servoFeed: 0.32,
  pressure: 2.8,
  flowRate: 9.4,
  conductivity: 4.5,
  openCircuitVoltage: 110,
  depthOfCut: 18,
  electrodeMaterial: "Copper",
  workpieceMaterial: "H13 Steel",
  machiningMode: "Die Sinking",
};

export function classifyGapState(params: MachineParameters): GapState {
  if (params.gapDistance < 0.024 || params.voltage < 20) return "Short Circuit";
  if (params.voltage > params.openCircuitVoltage * 0.7 && params.current < 2.5) return "Open Circuit";
  if (params.voltage < 42 && params.current > params.current * 0.7) return "Arc";
  return "Spark";
}

export function calculateDerivedMetrics(params: MachineParameters, elapsedSeconds: number): DerivedMetrics {
  const material = materialConstants[params.workpieceMaterial];
  const electrode = electrodeConstants[params.electrodeMaterial];
  const tonSeconds = params.pulseOn * 1e-6;
  const dutyCycle = (params.pulseOn / (params.pulseOn + params.pulseOff)) * 100;
  const sparkFrequency = 1000 / (params.pulseOn + params.pulseOff);
  const sparkEnergy = 0.5 * params.voltage * params.current * tonSeconds;
  const flushingFactor = clamp((params.flowRate / 10) * (params.pressure / 3), 0.45, 1.35);
  const gapPenalty = clamp(1 - Math.abs(params.gapDistance - 0.055) / 0.08, 0.2, 1);
  const mrr = material.k * params.current ** 0.75 * params.pulseOn ** 0.4 * flushingFactor * gapPenalty;
  const electrodeWearRatio = clamp((material.wear * electrode.wearFactor * sparkEnergy * dutyCycle) / 0.18, 0.5, 18);
  const toolWearRate = (mrr * electrodeWearRatio) / 100;
  const surfaceRoughness = material.raScale * (sparkEnergy * 1000) ** 0.38 * material.hardness;
  const power = (params.voltage * params.current * (dutyCycle / 100)) / 1000;
  const heatGeneration = power * 0.68 + sparkEnergy * sparkFrequency * 12;
  const coolingRate = params.flowRate * 0.42 + params.pressure * 0.31;
  const dielectricTemperature = clamp(22 + heatGeneration * 1.7 - coolingRate * 0.85 + elapsedSeconds / 2800, 18, 45);
  const cabinetTemperature = clamp(31 + power * 1.8 + dutyCycle * 0.04, 28, 72);
  const vibrationRms = clamp(0.65 + (params.current / 28) * 1.4 + (params.gapDistance < 0.035 ? 1.2 : 0), 0.3, 5.2);
  const arcRatio = clamp((params.current / 34) * 0.18 + (params.gapDistance < 0.04 ? 0.28 : 0) + (params.flowRate < 6 ? 0.18 : 0), 0.02, 0.82);
  const gapStability = clamp(100 - Math.abs(params.gapDistance - 0.055) * 920 - arcRatio * 35, 0, 100);
  const cycleTime = params.depthOfCut / Math.max(mrr / 60, 0.01);
  const energyConsumption = (power * elapsedSeconds) / 3600;
  const machineEfficiency = clamp((mrr / 9.5) * 74 + flushingFactor * 12 + gapStability * 0.14, 0, 100);
  const remainingToolLife = clamp(100 - (elapsedSeconds / 60) * toolWearRate * 0.45 - electrodeWearRatio * 0.7, 0, 100);
  const energyCost = energyConsumption * 0.14;
  const carbonEmissions = energyConsumption * 0.38;
  const oee = clamp(machineEfficiency * 0.72 + gapStability * 0.18 + remainingToolLife * 0.1, 0, 100);
  const machineHealth = clamp(100 - arcRatio * 38 - (dielectricTemperature > 30 ? (dielectricTemperature - 30) * 2.4 : 0) - (vibrationRms > 3 ? 12 : 0), 0, 100);
  const predictionConfidence = clamp(93 - arcRatio * 28 - Math.abs(params.gapDistance - 0.055) * 120, 55, 98);
  const twinAccuracy = clamp(96 - Math.abs(mrr - 5.8) * 1.2 - arcRatio * 18, 70, 99);

  return {
    power,
    dutyCycle,
    sparkFrequency,
    sparkEnergy,
    mrr,
    toolWearRate,
    surfaceRoughness,
    electrodeWearRatio,
    heatGeneration,
    coolingRate,
    gapStability,
    energyConsumption,
    machineEfficiency,
    cycleTime,
    remainingToolLife,
    energyCost,
    carbonEmissions,
    oee,
    machineHealth,
    predictionConfidence,
    twinAccuracy,
    gapState: classifyGapState(params),
    dielectricTemperature,
    cabinetTemperature,
    vibrationRms,
    arcRatio,
  };
}

export function buildAlarms(params: MachineParameters, metrics: DerivedMetrics): Alarm[] {
  const alarms: Alarm[] = [];
  if (params.current > 0.8 * 30 || metrics.arcRatio > 0.36) {
    alarms.push({ id: "arc-tendency", level: "WARNING", source: "A1/A2", message: "Arc tendency above qualified process band." });
  }
  if (params.voltage < 20 || metrics.gapState === "Short Circuit") {
    alarms.push({ id: "short-risk", level: "CRITICAL", source: "B2", message: "Gap voltage or gap distance indicates short-circuit risk." });
  }
  if (metrics.dielectricTemperature > 30) {
    alarms.push({ id: "thermal-risk", level: "WARNING", source: "C1", message: "Dielectric temperature exceeds 30 degC thermal risk threshold." });
  }
  if (params.conductivity > 10 && params.machiningMode === "Wire Cut") {
    alarms.push({ id: "conductivity", level: "WARNING", source: "C4", message: "Conductivity exceeds DI resin replacement threshold." });
  }
  if (metrics.remainingToolLife < 20) {
    alarms.push({ id: "tool-life", level: "WARNING", source: "B4", message: "Electrode remaining useful life below maintenance target." });
  }
  if (metrics.vibrationRms > 3) {
    alarms.push({ id: "vibration", level: "WARNING", source: "B3", message: "Vibration RMS above 3 g; inspect holder and fixture." });
  }
  if (metrics.cabinetTemperature > 65) {
    alarms.push({ id: "cabinet-temp", level: "CRITICAL", source: "D3", message: "Power cabinet temperature is approaching IGBT risk band." });
  }
  return alarms;
}

export function validateParameterSet(params: MachineParameters, metrics: DerivedMetrics): ValidationResult {
  const warnings: string[] = [];
  if (params.gapDistance < 0.03) warnings.push("Gap distance below short-circuit safety margin.");
  if (metrics.surfaceRoughness > 3.2) warnings.push("Predicted Ra exceeds aerospace finishing band.");
  if (metrics.electrodeWearRatio > 10) warnings.push("Electrode wear ratio is high for unattended operation.");
  if (metrics.dielectricTemperature > 32) warnings.push("Cooling capacity is insufficient for this duty cycle.");
  const physicsValid = warnings.length === 0;
  const aiValid = metrics.predictionConfidence > 72 && metrics.arcRatio < 0.5;
  return {
    physicsValid,
    aiValid,
    warnings,
    confidence: clamp((metrics.predictionConfidence + metrics.twinAccuracy) / 2 - warnings.length * 6, 35, 98),
  };
}

export function compareWhatIf(current: MachineParameters, candidate: MachineParameters, elapsedSeconds: number) {
  const currentMetrics = calculateDerivedMetrics(current, elapsedSeconds);
  const predicted = calculateDerivedMetrics(candidate, elapsedSeconds);
  return {
    current: currentMetrics,
    predicted,
    validation: validateParameterSet(candidate, predicted),
  };
}
