import { create } from "zustand";
import type { RealtimeDiagnostics } from "../Realtime/RealtimeClient";
import type {
  Alarm,
  ConnectionStatus,
  DashboardNotification,
  DataMode,
  DerivedMetrics,
  EventLogCategory,
  EventLogEntry,
  EventLogLevel,
  HistoryPoint,
  MachineLifecycleState,
  MachineParameters,
  MachineStatus,
  UnityTelemetry,
  UserRole,
  ValidationResult,
} from "../types/twin";
import { buildAlarms, calculateDerivedMetrics, compareWhatIf, defaultParameters, validateParameterSet } from "../services/edmCalculations";

interface TwinState {
  running: boolean;
  dataMode: DataMode;
  connectionStatus: ConnectionStatus;
  machineStatus: MachineStatus;
  machineState: MachineLifecycleState;
  unityTelemetry: UnityTelemetry;
  diagnostics: RealtimeDiagnostics;
  role: UserRole;
  elapsedSeconds: number;
  parameters: MachineParameters;
  pendingParameters: MachineParameters;
  pendingDirty: boolean;
  metrics: DerivedMetrics;
  validation: ValidationResult;
  alarms: Alarm[];
  alarmHistory: Alarm[];
  eventLog: EventLogEntry[];
  notifications: DashboardNotification[];
  history: HistoryPoint[];
  setRunning: (running: boolean) => void;
  setDataMode: (dataMode: DataMode) => void;
  setConnectionStatus: (connectionStatus: ConnectionStatus) => void;
  setMachineStatus: (machineStatus: MachineStatus) => void;
  setMachineState: (machineState: MachineLifecycleState) => void;
  updateUnityTelemetry: (telemetry: Partial<UnityTelemetry>) => void;
  applyLiveTelemetry: (payload: {
    telemetry?: Partial<UnityTelemetry>;
    parameters?: Partial<MachineParameters>;
    metrics?: Partial<DerivedMetrics>;
  }) => void;
  setRealtimeDiagnostics: (diagnostics: RealtimeDiagnostics) => void;
  addEvent: (level: EventLogLevel, category: EventLogCategory, message: string) => void;
  pushNotification: (level: EventLogLevel, message: string) => void;
  dismissNotification: (id: string) => void;
  setRole: (role: UserRole) => void;
  updatePendingParameter: <K extends keyof MachineParameters>(key: K, value: MachineParameters[K]) => void;
  incrementPendingParameter: (key: keyof Pick<MachineParameters, "voltage" | "current" | "gapVoltage" | "pulseOn" | "pulseOff" | "gapDistance" | "servoFeed" | "toolDiameter" | "pressure" | "flowRate" | "conductivity" | "openCircuitVoltage" | "depthOfCut">, delta: number) => void;
  resetPending: () => void;
  applyToTwin: () => void;
  tick: () => void;
}

const persistedSettingsKey = "edm.digitalTwin.machineSettings.v1";
const persistedEventsKey = "edm.digitalTwin.eventLog.v1";
const persistedAlarmsKey = "edm.digitalTwin.alarmHistory.v1";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function safeReadJson<T>(key: string, fallback: T): T {
  if (!canUseStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}

function safeReadArray<T>(key: string): T[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function safeWriteJson(key: string, value: unknown) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function persistMachineSettings(parameters: MachineParameters) {
  safeWriteJson(persistedSettingsKey, {
    current: parameters.current,
    voltage: parameters.voltage,
    gapVoltage: parameters.gapVoltage,
    pulseOn: parameters.pulseOn,
    pulseOff: parameters.pulseOff,
    machiningMode: parameters.machiningMode,
  });
}

function createId(prefix: string) {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
}

function buildEvent(level: EventLogLevel, category: EventLogCategory, message: string): EventLogEntry {
  return {
    id: createId("evt"),
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
  };
}

function buildNotification(level: EventLogLevel, message: string): DashboardNotification {
  return {
    id: createId("note"),
    timestamp: new Date().toISOString(),
    level,
    message,
  };
}

const numericBounds = {
  voltage: [40, 160],
  current: [2, 35],
  gapVoltage: [20, 140],
  pulseOn: [20, 300],
  pulseOff: [10, 180],
  gapDistance: [0.02, 0.18],
  servoFeed: [0.02, 1.2],
  toolDiameter: [0.2, 40],
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

const initialParameters = safeReadJson<MachineParameters>(persistedSettingsKey, defaultParameters);
const initialMetrics = calculateDerivedMetrics(initialParameters, 0);
const initialEventLog = safeReadArray<EventLogEntry>(persistedEventsKey).slice(0, 100);
const initialAlarmHistory = safeReadArray<Alarm>(persistedAlarmsKey).slice(0, 200);

export const useTwinStore = create<TwinState>((set) => ({
  running: true,
  dataMode: "simulation",
  connectionStatus: "disconnected",
  machineStatus: "Machining",
  machineState: "READY",
  unityTelemetry: {
    machineState: "READY",
    cyclePercent: 0,
    progressPercent: 0,
    toolPosition: 0,
    tankPosition: 0,
    sparkActive: false,
    machineTimeSeconds: 0,
    elapsedTimeSeconds: 0,
    remainingTimeSeconds: 0,
  },
  diagnostics: {
    packetsSent: 0,
    packetsReceived: 0,
    reconnectCount: 0,
    latencyMs: null,
    lastMessages: [],
  },
  role: "Production Engineer",
  elapsedSeconds: 0,
  parameters: initialParameters,
  pendingParameters: initialParameters,
  metrics: initialMetrics,
  pendingDirty: false,
  validation: validateParameterSet(initialParameters, initialMetrics),
  alarms: buildAlarms(initialParameters, initialMetrics),
  alarmHistory: initialAlarmHistory,
  eventLog: initialEventLog,
  notifications: [],
  history: Array.from({ length: 48 }, (_, index) => pointFromState(index, initialParameters, calculateDerivedMetrics(initialParameters, index))),
  setRunning: (running) => set({ running, machineStatus: running ? "Machining" : "Idle", machineState: running ? "MACHINING" : "STOPPED" }),
  setDataMode: (dataMode) => set((state) => ({ dataMode, eventLog: [buildEvent("INFO", "SYSTEM", `Data mode changed to ${dataMode}.`), ...state.eventLog].slice(0, 100) })),
  setConnectionStatus: (connectionStatus) =>
    set((state) => {
      const message = `Dashboard gateway connection ${connectionStatus}.`;
      const eventLog = [buildEvent(connectionStatus === "connected" ? "INFO" : "WARNING", "CONNECTION", message), ...state.eventLog].slice(0, 100);
      safeWriteJson(persistedEventsKey, eventLog);
      return {
        connectionStatus,
        eventLog,
        notifications: [buildNotification(connectionStatus === "connected" ? "INFO" : "WARNING", connectionStatus === "connected" ? "Connected" : "Disconnected"), ...state.notifications].slice(0, 6),
      };
    }),
  setMachineStatus: (machineStatus) => set({ machineStatus, running: machineStatus === "Machining" }),
  setMachineState: (machineState) => set((state) => ({ machineState, unityTelemetry: { ...state.unityTelemetry, machineState } })),
  updateUnityTelemetry: (telemetry) =>
    set((state) => {
      const unityTelemetry = { ...state.unityTelemetry, ...telemetry };
      return {
        unityTelemetry,
        machineState: unityTelemetry.machineState,
        machineStatus: unityTelemetry.machineState === "MACHINING" ? "Machining" : unityTelemetry.machineState === "OFFLINE" || unityTelemetry.machineState === "STOPPED" ? "Idle" : state.machineStatus,
        running: unityTelemetry.machineState === "MACHINING" ? true : unityTelemetry.machineState === "OFFLINE" || unityTelemetry.machineState === "STOPPED" ? false : state.running,
      };
    }),
  applyLiveTelemetry: ({ telemetry, parameters, metrics }) =>
    set((state) => {
      const unityTelemetry = { ...state.unityTelemetry, ...telemetry };
      const nextParameters = parameters ? { ...state.parameters, ...parameters } : state.parameters;
      const calculatedMetrics = parameters ? calculateDerivedMetrics(nextParameters, state.elapsedSeconds) : state.metrics;
      const nextMetrics = { ...calculatedMetrics, ...metrics };
      const machineStatus = unityTelemetry.machineState === "MACHINING" ? "Machining" : unityTelemetry.machineState === "OFFLINE" || unityTelemetry.machineState === "STOPPED" ? "Idle" : state.machineStatus;
      if (parameters) persistMachineSettings(nextParameters);

      return {
        parameters: nextParameters,
        pendingParameters: state.pendingDirty ? state.pendingParameters : nextParameters,
        metrics: nextMetrics,
        validation: validateParameterSet(nextParameters, nextMetrics),
        alarms: buildAlarms(nextParameters, nextMetrics),
        unityTelemetry,
        machineState: unityTelemetry.machineState,
        machineStatus,
        running: machineStatus === "Machining",
        history: [...state.history.slice(-119), pointFromState(Math.round(unityTelemetry.elapsedTimeSeconds || unityTelemetry.machineTimeSeconds || state.elapsedSeconds), nextParameters, nextMetrics)],
      };
    }),
  setRealtimeDiagnostics: (diagnostics) => set({ diagnostics }),
  addEvent: (level, category, message) =>
    set((state) => {
      const eventLog = [buildEvent(level, category, message), ...state.eventLog].slice(0, 100);
      safeWriteJson(persistedEventsKey, eventLog);
      return { eventLog };
    }),
  pushNotification: (level, message) => set((state) => ({ notifications: [buildNotification(level, message), ...state.notifications].slice(0, 6) })),
  dismissNotification: (id) => set((state) => ({ notifications: state.notifications.filter((notification) => notification.id !== id) })),
  setRole: (role) => set({ role }),
  updatePendingParameter: (key, value) =>
    set((state) => {
      const pendingParameters = { ...state.pendingParameters, [key]: value };
      const metrics = compareWhatIf(state.parameters, pendingParameters, state.elapsedSeconds).predicted;
      const eventLog = [buildEvent("INFO", "PARAMETER", `Pending parameter ${String(key)} changed.`), ...state.eventLog].slice(0, 100);
      safeWriteJson(persistedEventsKey, eventLog);
      return { pendingParameters, pendingDirty: true, validation: validateParameterSet(pendingParameters, metrics), eventLog };
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
      persistMachineSettings(state.pendingParameters);
      const alarms = buildAlarms(state.pendingParameters, metrics);
      const alarmHistory = [...alarms.map((alarm) => ({ ...alarm, timestamp: new Date().toISOString() })), ...state.alarmHistory].slice(0, 200);
      const eventLog = [buildEvent("INFO", "PARAMETER", "Parameters applied to digital twin."), ...state.eventLog].slice(0, 100);
      safeWriteJson(persistedEventsKey, eventLog);
      safeWriteJson(persistedAlarmsKey, alarmHistory);
      return {
        parameters: state.pendingParameters,
        metrics,
        pendingDirty: false,
        validation: validateParameterSet(state.pendingParameters, metrics),
        alarms,
        alarmHistory,
        eventLog,
        notifications: [buildNotification("INFO", "Parameters Applied"), ...state.notifications].slice(0, 6),
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
        gapVoltage: bounded("gapVoltage", state.parameters.gapVoltage + Math.sin(phase * 1.1) * 0.25),
        gapDistance: bounded("gapDistance", state.parameters.gapDistance + Math.sin(phase * 1.7) * 0.0004),
        flowRate: bounded("flowRate", state.parameters.flowRate + Math.sin(phase * 0.5) * 0.015),
        pressure: bounded("pressure", state.parameters.pressure + Math.cos(phase * 0.6) * 0.006),
      };
      const metrics = calculateDerivedMetrics(parameters, elapsedSeconds);
      const alarms = buildAlarms(parameters, metrics);
      return {
        elapsedSeconds,
        parameters,
        pendingParameters: state.pendingDirty ? state.pendingParameters : parameters,
        metrics,
        validation: validateParameterSet(parameters, metrics),
        alarms,
        history: [...state.history.slice(-119), pointFromState(elapsedSeconds, parameters, metrics)],
      };
    }),
}));
