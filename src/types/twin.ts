export type MachineMode = "Die Sinking" | "Wire Cut" | "EDM Drilling";
export type UserRole = "Operator" | "Production Engineer" | "Maintenance Engineer" | "Research Mode" | "Administrator";
export type GapState = "Open Circuit" | "Spark" | "Arc" | "Short Circuit";
export type AlarmLevel = "INFO" | "WARNING" | "CRITICAL";

export interface MachineParameters {
  voltage: number;
  current: number;
  pulseOn: number;
  pulseOff: number;
  gapDistance: number;
  servoFeed: number;
  pressure: number;
  flowRate: number;
  conductivity: number;
  openCircuitVoltage: number;
  depthOfCut: number;
  electrodeMaterial: "Copper" | "Graphite" | "Brass Wire" | "Tungsten Copper";
  workpieceMaterial: "H13 Steel" | "Titanium Ti-6Al-4V" | "Inconel 718" | "Tool Steel D2";
  machiningMode: MachineMode;
}

export interface DerivedMetrics {
  power: number;
  dutyCycle: number;
  sparkFrequency: number;
  sparkEnergy: number;
  mrr: number;
  toolWearRate: number;
  surfaceRoughness: number;
  electrodeWearRatio: number;
  heatGeneration: number;
  coolingRate: number;
  gapStability: number;
  energyConsumption: number;
  machineEfficiency: number;
  cycleTime: number;
  remainingToolLife: number;
  energyCost: number;
  carbonEmissions: number;
  oee: number;
  machineHealth: number;
  predictionConfidence: number;
  twinAccuracy: number;
  gapState: GapState;
  dielectricTemperature: number;
  cabinetTemperature: number;
  vibrationRms: number;
  arcRatio: number;
}

export interface Alarm {
  id: string;
  level: AlarmLevel;
  message: string;
  source: string;
}

export interface HistoryPoint extends DerivedMetrics {
  t: number;
  voltage: number;
  current: number;
  pressure: number;
  flowRate: number;
  gapDistance: number;
}

export interface ValidationResult {
  physicsValid: boolean;
  aiValid: boolean;
  warnings: string[];
  confidence: number;
}
