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
  CameraView,
  DatasetSample,
  DatasetState,
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
  cameraView: CameraView;
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
  dataset: DatasetState;
  setRunning: (running: boolean) => void;
  setDataMode: (dataMode: DataMode) => void;
  loadDataset: (fileName: string, headers: string[], rows: DatasetSample[]) => void;
  clearDataset: () => void;
  setDatasetPlaying: (playing: boolean) => void;
  restartDataset: () => void;
  advanceDataset: () => void;
  setConnectionStatus: (connectionStatus: ConnectionStatus) => void;
  setMachineStatus: (machineStatus: MachineStatus) => void;
  setMachineState: (machineState: MachineLifecycleState) => void;
  setCameraView: (cameraView: CameraView) => void;
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
    ...parameters,
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

function roundEditable(value: number) {
  return Number(value.toFixed(2));
}

function pointFromState(t: number | string, parameters: MachineParameters, metrics: DerivedMetrics): HistoryPoint {
  return {
    t,
    ...metrics,
    voltage: parameters.voltage,
    current: parameters.current,
    gapVoltage: parameters.gapVoltage,
    pulseOn: parameters.pulseOn,
    pulseOff: parameters.pulseOff,
    pressure: parameters.pressure,
    flowRate: parameters.flowRate,
    gapDistance: parameters.gapDistance,
  };
}

const emptyDatasetState: DatasetState = {
  loaded: false,
  fileName: null,
  status: "No dataset loaded",
  headers: [],
  rows: [],
  index: 0,
  playing: false,
};

function modeLabel(dataMode: DataMode) {
  if (dataMode === "live-unity") return "Live Unity";
  if (dataMode === "dataset") return "Dataset";
  return "Simulation";
}

function numericTime(value: number | string, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function applyDatasetSampleState(state: TwinState, index: number, playing: boolean): TwinState {
  const sample = state.dataset.rows[index];
  if (!sample) return state;

  const elapsedSeconds = numericTime(sample.t, index);
  const nextParameters = { ...state.parameters, ...sample.parameters };
  const calculatedMetrics = calculateDerivedMetrics(nextParameters, elapsedSeconds);
  const nextMetrics = { ...calculatedMetrics, ...sample.metrics };
  const progressPercent = ((index + 1) / state.dataset.rows.length) * 100;
  const machineState: MachineLifecycleState = playing ? "MACHINING" : index >= state.dataset.rows.length - 1 ? "STOPPED" : "PAUSED";
  const machineStatus: MachineStatus = playing ? "Machining" : "Idle";
  const unityTelemetry = {
    ...state.unityTelemetry,
    ...sample.telemetry,
    machineState,
    cyclePercent: progressPercent,
    progressPercent,
    elapsedTimeSeconds: elapsedSeconds,
    machineTimeSeconds: elapsedSeconds,
    remainingTimeSeconds: Math.max(0, state.dataset.rows.length - index - 1),
  };
  const alarms = buildAlarms(nextParameters, nextMetrics);
  const nextPoint = pointFromState(sample.t, nextParameters, nextMetrics);
  const previousPoint = state.history[state.history.length - 1];
  const history =
    previousPoint && previousPoint.t === nextPoint.t && previousPoint.mrr === nextPoint.mrr
      ? state.history
      : [...state.history.slice(-119), nextPoint];

  return {
    ...state,
    running: playing,
    machineStatus,
    machineState,
    elapsedSeconds,
    parameters: nextParameters,
    pendingParameters: nextParameters,
    pendingDirty: false,
    metrics: nextMetrics,
    validation: validateParameterSet(nextParameters, nextMetrics),
    alarms,
    unityTelemetry,
    dataset: {
      ...state.dataset,
      index,
      playing,
      status: playing ? "Dataset playback running" : index >= state.dataset.rows.length - 1 ? "Dataset playback complete" : "Dataset playback paused",
    },
    history,
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
  cameraView: "isometric",
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
  dataset: emptyDatasetState,
  setRunning: (running) => set({ running, machineStatus: running ? "Machining" : "Idle", machineState: running ? "MACHINING" : "STOPPED" }),
  setDataMode: (dataMode) =>
    set((state) => {
      if (dataMode === "dataset" && !state.dataset.loaded) {
        return {
          notifications: [buildNotification("WARNING", "Upload a CSV dataset to enable Dataset Mode."), ...state.notifications].slice(0, 6),
          eventLog: [buildEvent("WARNING", "SYSTEM", "Dataset Mode requested without a loaded CSV dataset."), ...state.eventLog].slice(0, 100),
        };
      }

      const eventLog = [buildEvent("INFO", "SYSTEM", `Data mode changed to ${modeLabel(dataMode)}.`), ...state.eventLog].slice(0, 100);
      if (dataMode === "dataset") {
        return applyDatasetSampleState({ ...state, dataMode, eventLog }, state.dataset.index, state.dataset.playing);
      }

      return {
        dataMode,
        running: dataMode === "simulation" ? state.running : state.running,
        dataset: { ...state.dataset, playing: false, status: state.dataset.loaded ? "Dataset paused" : state.dataset.status },
        eventLog,
      };
    }),
  loadDataset: (fileName, headers, rows) =>
    set((state) => {
      const dataset: DatasetState = {
        loaded: true,
        fileName,
        headers,
        rows,
        index: 0,
        playing: true,
        status: `Loaded ${rows.length} rows`,
      };
      const eventLog = [buildEvent("INFO", "SYSTEM", `Dataset ${fileName} loaded with ${rows.length} rows.`), ...state.eventLog].slice(0, 100);
      return applyDatasetSampleState({ ...state, dataMode: "dataset", dataset, eventLog, history: [] }, 0, true);
    }),
  clearDataset: () =>
    set((state) => {
      const metrics = calculateDerivedMetrics(state.parameters, state.elapsedSeconds);
      return {
        dataMode: "simulation",
        running: true,
        machineStatus: "Machining",
        machineState: "MACHINING",
        dataset: emptyDatasetState,
        metrics,
        validation: validateParameterSet(state.parameters, metrics),
        history: Array.from({ length: 48 }, (_, index) => pointFromState(index, state.parameters, calculateDerivedMetrics(state.parameters, index))),
        eventLog: [buildEvent("INFO", "SYSTEM", "Dataset cleared. Returned to Simulation Mode."), ...state.eventLog].slice(0, 100),
        notifications: [buildNotification("INFO", "Dataset Cleared"), ...state.notifications].slice(0, 6),
      };
    }),
  setDatasetPlaying: (playing) =>
    set((state) => {
      if (!state.dataset.loaded) return state;
      if (state.dataMode !== "dataset") return { ...state, dataset: { ...state.dataset, playing: false } };
      return applyDatasetSampleState(state, state.dataset.index, playing);
    }),
  restartDataset: () =>
    set((state) => {
      if (!state.dataset.loaded) return state;
      return applyDatasetSampleState({ ...state, dataMode: "dataset", history: [] }, 0, true);
    }),
  advanceDataset: () =>
    set((state) => {
      if (state.dataMode !== "dataset" || !state.dataset.loaded || !state.dataset.playing) return state;
      const nextIndex = state.dataset.index + 1;
      if (nextIndex >= state.dataset.rows.length) {
        return applyDatasetSampleState(state, state.dataset.index, false);
      }
      return applyDatasetSampleState(state, nextIndex, true);
    }),
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
  setCameraView: (cameraView) => set({ cameraView }),
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
      if (state.dataMode === "dataset") return state;
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
      const nextValue = roundEditable(bounded(key, Number(state.pendingParameters[key]) + delta));
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
        history: [...state.history.slice(-119), pointFromState(state.elapsedSeconds, state.pendingParameters, metrics)],
        notifications: [buildNotification("INFO", "Parameters Applied"), ...state.notifications].slice(0, 6),
      };
    }),
  tick: () =>
    set((state) => {
      if (state.dataMode === "dataset") {
        if (!state.dataset.loaded || !state.dataset.playing) return state;
        const nextIndex = state.dataset.index + 1;
        if (nextIndex >= state.dataset.rows.length) return applyDatasetSampleState(state, state.dataset.index, false);
        return applyDatasetSampleState(state, nextIndex, true);
      }
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
