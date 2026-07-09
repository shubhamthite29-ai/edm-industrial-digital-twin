import { create } from "zustand";
import type { Alarm, ConnectionStatus, DataMode, DerivedMetrics, HistoryPoint, MachineParameters, MachineStatus, UserRole, ValidationResult } from "../types/twin";
import { buildAlarms, calculateDerivedMetrics, compareWhatIf, defaultParameters, validateParameterSet } from "../services/edmCalculations";

interface TwinState {
  running: boolean;
  dataMode: DataMode;
  connectionStatus: ConnectionStatus;
  machineStatus: MachineStatus;
  role: UserRole;
  elapsedSeconds: number;
  parameters: MachineParameters;
  pendingParameters: MachineParameters;
  pendingDirty: boolean;
  metrics: DerivedMetrics;
  validation: ValidationResult;
  alarms: Alarm[];
  history: HistoryPoint[];
  setRunning: (running: boolean) => void;
  setDataMode: (dataMode: DataMode) => void;
  setConnectionStatus: (connectionStatus: ConnectionStatus) => void;
  setMachineStatus: (machineStatus: MachineStatus) => void;
  setRole: (role: UserRole) => void;
  updatePendingParameter: <K extends keyof MachineParameters>(key: K, value: MachineParameters[K]) => void;
  incrementPendingParameter: (key: keyof Pick<MachineParameters, "voltage" | "current" | "pulseOn" | "pulseOff" | "gapDistance" | "servoFeed" | "pressure" | "flowRate" | "conductivity" | "openCircuitVoltage" | "depthOfCut">, delta: number) => void;
  resetPending: () => void;
  applyToTwin: () => void;
  tick: () => void;
}

const numericBounds = {
  voltage: [40, 160],
  current: [2, 35],
  pulseOn: [20, 300],
  pulseOff: [10, 180],
  gapDistance: [0.02, 0.18],
  servoFeed: [0.02, 1.2],
  pressure: [0.5, 8],
  flowRate: [1, 20],
  conductivity: [0.5, 18],
  openCircuitVoltage: [70, 140],
  depthOfCut: [0.5, 80],
} satisfies Record<string, [number, number]>;

function bounded<K extends keyof typeof numericBounds>(key: K, value: number) {
  const [min, max] = numericBounds[key];
  return Math.min(max, Math.max(min, value));
}

function pointFromState(t: number, parameters: MachineParameters, metrics: DerivedMetrics): HistoryPoint {
  return {
    t,
    ...metrics,
    voltage: parameters.voltage,
    current: parameters.current,
    pressure: parameters.pressure,
    flowRate: parameters.flowRate,
    gapDistance: parameters.gapDistance,
  };
}

const initialMetrics = calculateDerivedMetrics(defaultParameters, 0);

export const useTwinStore = create<TwinState>((set) => ({
  running: true,
  dataMode: "simulation",
  connectionStatus: "disconnected",
  machineStatus: "Machining",
  role: "Production Engineer",
  elapsedSeconds: 0,
  parameters: defaultParameters,
  pendingParameters: defaultParameters,
  metrics: initialMetrics,
  pendingDirty: false,
  validation: validateParameterSet(defaultParameters, initialMetrics),
  alarms: buildAlarms(defaultParameters, initialMetrics),
  history: Array.from({ length: 48 }, (_, index) => pointFromState(index, defaultParameters, calculateDerivedMetrics(defaultParameters, index))),
  setRunning: (running) => set({ running, machineStatus: running ? "Machining" : "Idle" }),
  setDataMode: (dataMode) => set({ dataMode }),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  setMachineStatus: (machineStatus) => set({ machineStatus, running: machineStatus === "Machining" }),
  setRole: (role) => set({ role }),
  updatePendingParameter: (key, value) =>
    set((state) => {
      const pendingParameters = { ...state.pendingParameters, [key]: value };
      const metrics = compareWhatIf(state.parameters, pendingParameters, state.elapsedSeconds).predicted;
      return { pendingParameters, pendingDirty: true, validation: validateParameterSet(pendingParameters, metrics) };
    }),
  incrementPendingParameter: (key, delta) =>
    set((state) => {
      const nextValue = bounded(key, Number(state.pendingParameters[key]) + delta);
      const pendingParameters = { ...state.pendingParameters, [key]: nextValue };
      const metrics = compareWhatIf(state.parameters, pendingParameters, state.elapsedSeconds).predicted;
      return { pendingParameters, pendingDirty: true, validation: validateParameterSet(pendingParameters, metrics) };
    }),
  resetPending: () => set((state) => ({ pendingParameters: state.parameters, pendingDirty: false, validation: validateParameterSet(state.parameters, state.metrics) })),
  applyToTwin: () =>
    set((state) => {
      const metrics = calculateDerivedMetrics(state.pendingParameters, state.elapsedSeconds);
      return {
        parameters: state.pendingParameters,
        metrics,
        pendingDirty: false,
        validation: validateParameterSet(state.pendingParameters, metrics),
        alarms: buildAlarms(state.pendingParameters, metrics),
      };
    }),
  tick: () =>
    set((state) => {
      if (state.dataMode !== "simulation") return state;
      if (!state.running) return state;
      const elapsedSeconds = state.elapsedSeconds + 1;
      const phase = elapsedSeconds / 28;
      const parameters: MachineParameters = {
        ...state.parameters,
        voltage: bounded("voltage", state.parameters.voltage + Math.sin(phase) * 0.35),
        current: bounded("current", state.parameters.current + Math.cos(phase * 0.8) * 0.08),
        gapDistance: bounded("gapDistance", state.parameters.gapDistance + Math.sin(phase * 1.7) * 0.0004),
        flowRate: bounded("flowRate", state.parameters.flowRate + Math.sin(phase * 0.5) * 0.015),
        pressure: bounded("pressure", state.parameters.pressure + Math.cos(phase * 0.6) * 0.006),
      };
      const metrics = calculateDerivedMetrics(parameters, elapsedSeconds);
      return {
        elapsedSeconds,
        parameters,
        pendingParameters: state.pendingDirty ? state.pendingParameters : parameters,
        metrics,
        validation: validateParameterSet(parameters, metrics),
        alarms: buildAlarms(parameters, metrics),
        history: [...state.history.slice(-119), pointFromState(elapsedSeconds, parameters, metrics)],
      };
    }),
}));
