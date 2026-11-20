import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Bot,
  Boxes,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Download,
  Gauge,
  Menu,
  MoveVertical,
  Pause,
  Play,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  X,
  LogOut,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MetricCard } from "../components/MetricCard";
import { Panel } from "../components/Panel";
import { ParameterStepper } from "../components/ParameterStepper";
import { SensorDiagram } from "../components/SensorDiagram";
import { StatusPill } from "../components/StatusPill";
import { UnityWebGLViewer } from "../components/UnityWebGLViewer";
import { ToolheadDigitalTwin } from "../components/ToolheadDigitalTwin";
import { PhysicalMachineMlPanel } from "../components/PhysicalMachineMlPanel";
import { LoginLandingPage } from "../components/LoginLandingPage";
import { GuestDemoShowcase } from "../components/GuestDemoShowcase";
import { EdmMachineInfoPanel } from "../components/EdmMachineInfoPanel";
import { useAuthStore } from "../store/useAuthStore";
import { roleDisplayLabel } from "../types/auth";
import { sensors, sensorGroups } from "../data/sensors";
import { useInterval } from "../hooks/useInterval";
import { compareWhatIf } from "../services/edmCalculations";
import { parseCsvDataset } from "../services/csvDatasetService";
import { analyzeDatasetOptimization, optimizationObjectives, type OptimizationObjective, type RankedExperimentalCondition } from "../services/edmOptimizationService";
import {
  getMlHealth,
  getMlElectrodes,
  getMlInputRanges,
  getMlMaterials,
  getMlModelInfo,
  getMlSources,
  predictMl,
  type MlMaterialTableEntry,
  type MlModelInfo,
  type MlPredictionResult,
  type MlSourceInfo,
} from "../services/mlApiService";
import {
  emergencyStopLiveMachine,
  homeLiveMachine,
  initializeLiveUnityService,
  pauseLiveMachine,
  pingGateway,
  requestLiveStatus,
  resetLiveMachine,
  resumeLiveMachine,
  setLiveCameraView,
  startLiveMachining,
  stopLiveMachining,
} from "../services/liveUnityService";
import { realtimeClient } from "../Realtime/RealtimeClient";
import { machineParameterService } from "../Machine/MachineParameterService";
import { initializeToolheadService } from "../services/toolheadService";
import { useTwinStore } from "../store/useTwinStore";
import type { CameraView, ConnectionStatus, DashboardNotification, DataMode, MachineMode, MachineParameters } from "../types/twin";

const modules = [
  { key: "dashboard", label: "Overview", icon: Gauge },
  { key: "digital-twin", label: "Digital Twin", icon: Boxes },
  { key: "toolhead", label: "Toolhead Simulation", icon: MoveVertical },
  { key: "machine-control", label: "Machine Control", icon: SlidersHorizontal },
  { key: "analytics", label: "Analysis", icon: BarChart3 },
  { key: "predictions", label: "ML Optimization", icon: BrainCircuit },
  { key: "settings", label: "Platform Settings", icon: Settings },
];

const legacyModuleGroups: Record<string, string> = {
  "live-machine": "dashboard",
  simulation: "dashboard",
  "ai-copilot": "analytics",
  engineering: "digital-twin",
  maintenance: "analytics",
  "alarm-center": "analytics",
  reports: "analytics",
  "research-mode": "analytics",
};

const machineModes: MachineMode[] = ["Die Sinking", "Wire Cut", "EDM Drilling"];
const electrodeMaterials: MachineParameters["electrodeMaterial"][] = ["Copper", "Graphite", "Brass Wire", "Tungsten Copper"];
const workpieceMaterials: MachineParameters["workpieceMaterial"][] = ["H13 Steel", "Titanium Ti-6Al-4V", "Inconel 718", "Tool Steel D2"];

function fmt(value: number, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : "--";
}

function fmtMaybe(value: unknown, digits = 2) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits).replace(/\.?0+$/, "") : "--";
}

function currentModule(pathname: string) {
  const key = pathname.replace("/", "") || "dashboard";
  return modules.some((item) => item.key === key) ? key : legacyModuleGroups[key] ?? "dashboard";
}

function connectionTone(status: ConnectionStatus) {
  if (!realtimeClient.isConfigured()) return "cyan";
  if (status === "connected") return "green";
  if (status === "connecting") return "amber";
  return "red";
}

function connectionLabel(status: ConnectionStatus) {
  if (!realtimeClient.isConfigured()) return "Physical Gateway Not Configured (Simulation Active)";
  if (status === "connected") return "Gateway Connected";
  if (status === "connecting") return "Connecting...";
  return "Gateway Disconnected";
}

function secondsLabel(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "00:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function ShellHeader({ menuOpen, onToggleMenu }: { menuOpen: boolean; onToggleMenu: () => void }) {
  const running = useTwinStore((state) => state.running);
  const setRunning = useTwinStore((state) => state.setRunning);
  const dataMode = useTwinStore((state) => state.dataMode);
  const setDataMode = useTwinStore((state) => state.setDataMode);
  const connectionStatus = useTwinStore((state) => state.connectionStatus);
  const unityWebGLReady = useTwinStore((state) => state.unityWebGLReady);
  const machineStatus = useTwinStore((state) => state.machineStatus);
  const metrics = useTwinStore((state) => state.metrics);
  const alarms = useTwinStore((state) => state.alarms);
  const dataset = useTwinStore((state) => state.dataset);
  const setDatasetPlaying = useTwinStore((state) => state.setDatasetPlaying);
  const pushNotification = useTwinStore((state) => state.pushNotification);

  const user = useAuthStore((state) => state.user);
  const authRole = useAuthStore((state) => state.role);
  const signOut = useAuthStore((state) => state.signOut);

  const liveModeDisconnected = dataMode === "live-unity" && connectionStatus !== "connected" && !unityWebGLReady;
  const runActive = dataMode === "dataset" ? dataset.playing : running;

  const handleRunToggle = () => {
    if (dataMode === "simulation") {
      setRunning(!running);
      return;
    }

    if (dataMode === "dataset") {
      setDatasetPlaying(!dataset.playing);
      return;
    }

    // Physical live-unity execution guard
    if (authRole === "guest" || authRole === "research") {
      pushNotification("WARNING", "Physical machine execution restricted. Control requires Administrator or HOD.");
      return;
    }

    if (running) {
      stopLiveMachining();
    } else {
      startLiveMachining();
    }
  };

  return (
    <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-plant-line bg-plant-deck/95 px-3 py-2 sm:px-5">
      <div className="flex items-center gap-2.5 sm:gap-3">
        <button
          type="button"
          onClick={onToggleMenu}
          className="flex h-10 w-10 items-center justify-center rounded border border-plant-line bg-plant-void text-plant-muted transition hover:border-plant-cyan/60 hover:text-plant-cyan md:hidden"
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        <div>
          <div className="text-sm font-bold uppercase tracking-[0.16em] text-plant-cyan sm:text-base sm:tracking-[0.24em] md:text-lg">
            EDM Industrial Digital Twin
          </div>
          <div className="text-[9px] uppercase tracking-[0.14em] text-plant-muted sm:text-[11px] sm:tracking-[0.2em]">
            Physics model + sensor fusion + AI decision support
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        <StatusPill label={machineStatus} tone={machineStatus === "Machining" ? "green" : "red"} />
        <StatusPill
          label={connectionLabel(connectionStatus)}
          tone={connectionTone(connectionStatus)}
        />
        {dataMode === "live-unity" ? <StatusPill label={unityWebGLReady ? "Unity WebGL Ready" : "Unity WebGL Loading"} tone={unityWebGLReady ? "green" : "amber"} /> : null}
        <StatusPill label={`${fmt(metrics.twinAccuracy, 0)}% Twin Sync`} tone="cyan" />
        <StatusPill label={`${alarms.length} Alarms`} tone={alarms.some((alarm) => alarm.level === "CRITICAL") ? "red" : alarms.length ? "amber" : "green"} />
        <div className="inline-flex h-9 overflow-x-auto rounded border border-plant-line bg-plant-void">
          {[
            ["simulation", "Simulation"],
            ["live-unity", "Live Unity"],
            ["dataset", "Dataset"],
          ].map(([mode, label]) => (
            <button
              key={mode}
              className={`px-2.5 sm:px-3 text-xs font-semibold uppercase tracking-wide transition ${
                dataMode === mode ? "bg-plant-cyan text-plant-void" : "text-plant-muted hover:text-plant-text"
              }`}
              onClick={() => setDataMode(mode as DataMode)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        {/* Verified Role Badge & Sign Out Button */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div
            className={`inline-flex h-9 items-center gap-1.5 rounded border px-2.5 sm:px-3 text-xs font-semibold uppercase tracking-wider ${
              authRole === "administrator"
                ? "border-plant-red/60 bg-plant-red/15 text-plant-red"
                : authRole === "hod"
                ? "border-purple-400/60 bg-purple-500/15 text-purple-300"
                : authRole === "research"
                ? "border-plant-amber/60 bg-plant-amber/15 text-plant-amber"
                : "border-plant-cyan/60 bg-plant-cyan/15 text-plant-cyan"
            }`}
            title={`Session: ${user?.email || "Guest"}`}
          >
            <ShieldCheck size={14} />
            <span>{roleDisplayLabel(authRole)}</span>
          </div>

          <button
            type="button"
            onClick={signOut}
            className="inline-flex h-9 items-center gap-1.5 rounded border border-plant-line bg-plant-void px-2.5 sm:px-3 text-xs font-semibold uppercase tracking-wider text-plant-muted transition hover:border-plant-red/60 hover:text-plant-red active:scale-95"
            title="Sign Out of Session"
            aria-label="Sign Out"
          >
            <LogOut size={14} />
            <span className="hidden md:inline">Sign Out</span>
          </button>
        </div>

        <button
          className={`inline-flex h-9 items-center gap-1.5 sm:gap-2 rounded px-3 text-xs font-semibold uppercase tracking-wide ${
            runActive ? "bg-plant-red text-white" : "bg-plant-green text-plant-void"
          }`}
          disabled={liveModeDisconnected}
          onClick={handleRunToggle}
          type="button"
        >
          {runActive ? <Pause size={15} /> : <Play size={15} />}
          {runActive ? "Halt" : "Start"}
        </button>
      </div>
    </header>
  );
}

function MobileNavDrawer({ active, onClose }: { active: string; onClose: () => void }) {
  const permissions = useAuthStore((state) => state.permissions);
  const visibleModules = useMemo(() => {
    return modules.filter((item) => {
      if (item.key === "settings") return permissions.canAccessSettings;
      if (item.key === "machine-control") return permissions.canControlPhysicalMachine;
      if (item.key === "toolhead") return permissions.canViewDigitalTwin;
      if (item.key === "analytics") return permissions.canExportReports;
      return true;
    });
  }, [permissions]);

  return (
    <div className="fixed inset-0 z-50 flex md:hidden">
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative flex w-4/5 max-w-xs flex-col border-r border-plant-line bg-plant-deck p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-plant-line pb-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-plant-cyan">Navigation</div>
            <div className="text-[10px] uppercase tracking-wider text-plant-muted">CELL-EDM-04</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded border border-plant-line text-plant-muted hover:text-plant-text"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="mt-4 flex flex-1 flex-col gap-1.5 overflow-y-auto">
          {visibleModules.map((item) => {
            const Icon = item.icon;
            const selected = item.key === active;
            return (
              <Link
                key={item.key}
                to={`/${item.key === "dashboard" ? "" : item.key}`}
                onClick={onClose}
                className={`flex min-h-[44px] items-center gap-3 rounded-lg border px-3.5 py-2.5 text-xs font-bold uppercase tracking-wider transition ${
                  selected
                    ? "border-plant-cyan/70 bg-plant-cyan/15 text-plant-cyan shadow-sm"
                    : "border-transparent text-plant-muted hover:border-plant-line hover:bg-plant-panel hover:text-plant-text"
                }`}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-plant-line pt-4 text-[10px] uppercase text-plant-muted">
          EDM Industrial Digital Twin v2.5.0
        </div>
      </div>
    </div>
  );
}

function Sidebar({ active }: { active: string }) {
  const permissions = useAuthStore((state) => state.permissions);
  const visibleModules = useMemo(() => {
    return modules.filter((item) => {
      if (item.key === "settings") return permissions.canAccessSettings;
      if (item.key === "machine-control") return permissions.canControlPhysicalMachine;
      if (item.key === "toolhead") return permissions.canViewDigitalTwin;
      if (item.key === "analytics") return permissions.canExportReports;
      return true;
    });
  }, [permissions]);

  return (
    <nav aria-label="Dashboard navigation" className="sticky top-2 z-40 mx-4 mt-3 hidden md:block overflow-x-auto rounded border border-plant-line bg-plant-deck/95 p-2 shadow-glow backdrop-blur">
      <div className="flex min-w-max items-center gap-1">
        <div className="hidden border-r border-plant-line px-3 py-1.5 xl:block">
          <div className="text-[9px] uppercase tracking-[0.2em] text-plant-muted">EDM Cell</div>
          <div className="mt-0.5 font-mono text-xs text-plant-text">CELL-EDM-04</div>
        </div>
        {visibleModules.map((item) => {
          const Icon = item.icon;
          const selected = item.key === active;
          return (
            <Link
              key={item.key}
              to={`/${item.key === "dashboard" ? "" : item.key}`}
              className={`flex h-9 shrink-0 items-center gap-2 rounded border px-3 text-xs font-semibold uppercase tracking-wide transition ${
                selected
                  ? "border-plant-cyan/70 bg-plant-cyan/12 text-plant-cyan"
                  : "border-transparent text-plant-muted hover:border-plant-line hover:bg-plant-panel hover:text-plant-text"
              }`}
            >
              <Icon size={16} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function LiveMetrics() {
  const parameters = useTwinStore((state) => state.parameters);
  const metrics = useTwinStore((state) => state.metrics);
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
      <MetricCard label="Current" value={fmt(parameters.current, 1)} unit="A" tone="amber" sublabel="A2 discharge sensor" />
      <MetricCard label="Gap Voltage" value={fmt(parameters.gapVoltage, 0)} unit="V" tone="cyan" sublabel={metrics.gapState} />
      <MetricCard label="MRR" value={fmt(metrics.mrr, 2)} unit="mm3/min" tone="green" sublabel="Physics prediction" />
      <MetricCard label="Surface Ra" value={fmt(metrics.surfaceRoughness, 2)} unit="um" tone={metrics.surfaceRoughness > 3 ? "amber" : "cyan"} sublabel="Predicted finish" />
      <MetricCard label="Power" value={fmt(metrics.power, 2)} unit="kW" tone="violet" sublabel={`${fmt(metrics.dutyCycle, 1)}% duty cycle`} />
      <MetricCard label="Gap Stability" value={fmt(metrics.gapStability, 0)} unit="%" tone={metrics.gapStability > 75 ? "green" : "amber"} sublabel={`${fmt(metrics.arcRatio * 100, 0)}% arc ratio`} />
      <MetricCard label="Tool Life" value={fmt(metrics.remainingToolLife, 0)} unit="%" tone={metrics.remainingToolLife < 20 ? "red" : "green"} sublabel={`${fmt(metrics.electrodeWearRatio, 2)}% EWR`} />
      <MetricCard label="Health" value={fmt(metrics.machineHealth, 0)} unit="%" tone={metrics.machineHealth > 80 ? "green" : "amber"} sublabel={`${fmt(metrics.predictionConfidence, 0)}% confidence`} />
    </div>
  );
}

function TrendChart({ dataKey, color, title, unit }: { dataKey: string; color: string; title: string; unit: string }) {
  const history = useTwinStore((state) => state.history);
  return (
    <Panel title={title} eyebrow={unit} className="min-h-[230px]">
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={history} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id={`${dataKey}-gradient`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.36} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#273244" strokeDasharray="3 3" />
          <XAxis dataKey="t" tick={{ fill: "#8291a5", fontSize: 10 }} />
          <YAxis tick={{ fill: "#8291a5", fontSize: 10 }} />
          <Tooltip contentStyle={{ background: "#101722", border: "1px solid #273244", color: "#d9e3ee" }} />
          <Area type="monotone" dataKey={dataKey} stroke={color} fill={`url(#${dataKey}-gradient)`} strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </Panel>
  );
}

function MachineView() {
  const metrics = useTwinStore((state) => state.metrics);
  const telemetry = useTwinStore((state) => state.unityTelemetry);
  const machineState = useTwinStore((state) => state.machineState);
  const cameraView = useTwinStore((state) => state.cameraView);
  const connectionStatus = useTwinStore((state) => state.connectionStatus);
  return (
    <Panel title="3D EDM Digital Twin" eyebrow="Direct Unity WebGL renderer" accent="violet">
      <UnityWebGLViewer connectionStatus={connectionStatus} telemetry={telemetry} machineState={machineState} cameraView={cameraView} />
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <StatusPill label={`Spark ${metrics.gapState}`} tone={metrics.gapState === "Spark" ? "green" : metrics.gapState === "Arc" ? "red" : "amber"} />
        <StatusPill label={`${fmt(metrics.dielectricTemperature, 1)} degC dielectric`} tone={metrics.dielectricTemperature > 30 ? "amber" : "cyan"} />
        <StatusPill label={`${fmt(metrics.vibrationRms, 2)} g vibration`} tone={metrics.vibrationRms > 3 ? "red" : "green"} />
      </div>
    </Panel>
  );
}

function DatasetPanel() {
  const dataset = useTwinStore((state) => state.dataset);
  const dataMode = useTwinStore((state) => state.dataMode);
  const setDataMode = useTwinStore((state) => state.setDataMode);
  const loadDataset = useTwinStore((state) => state.loadDataset);
  const clearDataset = useTwinStore((state) => state.clearDataset);
  const setDatasetPlaying = useTwinStore((state) => state.setDatasetPlaying);
  const restartDataset = useTwinStore((state) => state.restartDataset);
  const pushNotification = useTwinStore((state) => state.pushNotification);
  const [uploadStatus, setUploadStatus] = useState("Upload a CSV dataset to enable Dataset Mode.");

  const handleUpload = async (file: File | null) => {
    if (!file) return;
    try {
      const parsed = parseCsvDataset(await file.text(), file.name);
      loadDataset(parsed.fileName, parsed.headers, parsed.rows);
      setUploadStatus(`Loaded ${parsed.rows.length} rows from ${file.name}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to parse CSV dataset.";
      setUploadStatus(message);
      pushNotification("WARNING", message);
    }
  };

  return (
    <Panel title="Dataset / Data Source" eyebrow="Authoritative operating mode" accent="cyan">
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          <div className="inline-flex overflow-hidden rounded border border-plant-line bg-plant-void">
            {([
              ["simulation", "Simulation"],
              ["live-unity", "Live Unity"],
              ["dataset", "Dataset"],
            ] as Array<[DataMode, string]>).map(([mode, label]) => (
              <button
                key={mode}
                className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide transition ${
                  dataMode === mode ? "bg-plant-cyan text-plant-void" : "text-plant-muted hover:text-plant-text"
                }`}
                onClick={() => setDataMode(mode)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <Spec label="Data Source" value={dataMode === "dataset" ? "DATASET MODE" : dataMode === "live-unity" ? "LIVE UNITY MODE" : "SIMULATION MODE"} />
            <Spec label="File" value={dataset.fileName ?? "No CSV loaded"} />
            <Spec label="Rows" value={dataset.loaded ? dataset.rows.length.toLocaleString() : "0"} />
            <Spec label="Current Sample" value={dataset.loaded ? `${dataset.index + 1} / ${dataset.rows.length}` : "0 / 0"} />
          </div>
          <div className="text-xs leading-5 text-plant-muted">{dataset.loaded ? dataset.status : uploadStatus}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <label className="inline-flex cursor-pointer items-center justify-center rounded bg-plant-cyan px-4 py-2 text-xs font-semibold uppercase tracking-wide text-plant-void">
            Upload CSV
            <input className="hidden" type="file" accept=".csv,text/csv" onChange={(event) => handleUpload(event.target.files?.[0] ?? null)} />
          </label>
          <button className="rounded border border-plant-line px-3 py-2 text-xs font-semibold uppercase text-plant-text disabled:cursor-not-allowed disabled:opacity-40" disabled={!dataset.loaded} onClick={() => setDatasetPlaying(!dataset.playing)} type="button">
            {dataset.playing ? "Pause" : "Play"}
          </button>
          <button className="rounded border border-plant-line px-3 py-2 text-xs font-semibold uppercase text-plant-text disabled:cursor-not-allowed disabled:opacity-40" disabled={!dataset.loaded} onClick={restartDataset} type="button">
            Restart
          </button>
          <button className="rounded border border-plant-red px-3 py-2 text-xs font-semibold uppercase text-plant-red disabled:cursor-not-allowed disabled:opacity-40" disabled={!dataset.loaded} onClick={clearDataset} type="button">
            Clear Dataset
          </button>
        </div>
      </div>
    </Panel>
  );
}

function sampleLabel(condition: RankedExperimentalCondition | null) {
  if (!condition) return "--";
  const sampleId = condition.sample.t !== "" && condition.sample.t != null ? condition.sample.t : condition.rowIndex + 1;
  return `Sample ${sampleId}`;
}

function fieldAvailable(rows: RankedExperimentalCondition[], read: (condition: RankedExperimentalCondition) => unknown) {
  return rows.some((condition) => typeof read(condition) === "number" && Number.isFinite(read(condition) as number));
}

const mlEditableDecimalPattern = /^-?(?:\d+(?:\.\d{0,3})?|\.\d{0,3})?$/;
const mlCompleteDecimalPattern = /^-?(?:\d+(?:\.\d{1,3})?|\.\d{1,3})$/;

function formatMlNumber(value: number, integerOnly = false) {
  if (!Number.isFinite(value)) return "";
  if (integerOnly) return String(Math.trunc(value));
  return Number(value.toFixed(3)).toString();
}

function normalizeMlDraft(value: string, integerOnly = false) {
  if (integerOnly) {
    const sanitized = value.trim();
    return /^\d*$/.test(sanitized) ? sanitized : null;
  }

  const normalized = value.replace(",", ".");
  if (mlEditableDecimalPattern.test(normalized)) return normalized;

  // A paste may contain more precision than the UI accepts. Keep the valid
  // three-decimal prefix instead of rejecting the entire edit.
  const decimal = normalized.match(/^(-?(?:\d+)?)(?:\.(\d+))?$/);
  if (!decimal) return null;
  return `${decimal[1] || "0"}.${decimal[2].slice(0, 3)}`;
}

function parseMlDraft(value: string, integerOnly = false) {
  if (integerOnly) return /^\d+$/.test(value) ? Number(value) : undefined;
  return mlCompleteDecimalPattern.test(value) ? Number(value) : undefined;
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function MlNumberInput({ label, value, unit, onChange, onEnter, min, max, step = 0.001, readOnly = false, integerOnly = false }: { label: string; value: number; unit: string; onChange: (value: number) => void; onEnter?: () => void; min?: number; max?: number; step?: number; readOnly?: boolean; integerOnly?: boolean }) {
  const [draft, setDraft] = useState(() => formatMlNumber(value, integerOnly));
  const [focused, setFocused] = useState(false);
  const [hasUncommittedDraft, setHasUncommittedDraft] = useState(false);

  useEffect(() => {
    if (!focused && !hasUncommittedDraft) setDraft(formatMlNumber(value, integerOnly));
  }, [focused, hasUncommittedDraft, integerOnly, value]);

  const commit = () => {
    setFocused(false);
    let next = parseMlDraft(draft, integerOnly);
    if (next === undefined) {
      if (min !== undefined) {
        next = min;
      } else {
        setHasUncommittedDraft(true);
        return;
      }
    }
    if (min !== undefined && next < min) next = min;
    if (max !== undefined && next > max) next = max;
    onChange(next);
    setDraft(formatMlNumber(next, integerOnly));
    setHasUncommittedDraft(false);
  };
  const parsedDraft = parseMlDraft(draft, integerOnly);
  const hasRangeWarning = parsedDraft !== undefined && Number.isFinite(parsedDraft) && min !== undefined && max !== undefined && (parsedDraft < min || parsedDraft > max);

  const updateDraft = (nextDraft: string) => {
    const normalized = normalizeMlDraft(nextDraft, integerOnly);
    if (normalized === null) return;

    setDraft(normalized);
    setHasUncommittedDraft(true);
    const parsed = parseMlDraft(normalized, integerOnly);
    if (parsed !== undefined && Number.isFinite(parsed)) {
      onChange(parsed);
    }
  };

  const stepValue = (direction: 1 | -1) => {
    const base = parseMlDraft(draft, integerOnly) ?? value;
    let next = integerOnly ? Math.trunc(base + direction * step) : Number((base + direction * step).toFixed(3));
    if (min !== undefined && next < min) next = min;
    if (max !== undefined && next > max) next = max;
    setDraft(formatMlNumber(next, integerOnly));
    onChange(next);
    setHasUncommittedDraft(false);
  };

  return (
    <div className="block rounded border border-plant-line bg-plant-void p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.16em] text-plant-muted">{label}</span>
        {min !== undefined && max !== undefined ? (
          <span className="font-mono text-[10px] text-plant-muted">{min} - {max} {unit}</span>
        ) : null}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="flex min-w-0 flex-1 overflow-hidden rounded border border-plant-line bg-plant-deck focus-within:border-plant-cyan">
          <input
            className="relative z-10 h-10 min-w-0 flex-1 cursor-text bg-transparent px-2.5 font-mono text-sm text-plant-text outline-none disabled:cursor-default disabled:text-plant-muted"
            inputMode={integerOnly ? "numeric" : "decimal"}
            type="text"
            autoComplete="off"
            aria-label={`${label} (${unit})`}
            value={draft}
            readOnly={readOnly}
            onBlur={commit}
            onFocus={(event) => {
              setFocused(true);
              event.target.select();
            }}
            onChange={(event) => updateDraft(event.target.value)}
            onKeyDown={(event) => {
              if (readOnly) return;
              if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                event.preventDefault();
                stepValue(event.key === "ArrowUp" ? 1 : -1);
                return;
              }
              if (event.key === "Home" && min !== undefined) {
                event.preventDefault();
                setDraft(formatMlNumber(min, integerOnly));
                onChange(min);
                setHasUncommittedDraft(false);
                return;
              }
              if (event.key === "End" && max !== undefined) {
                event.preventDefault();
                setDraft(formatMlNumber(max, integerOnly));
                onChange(max);
                setHasUncommittedDraft(false);
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
                if (onEnter) onEnter();
                return;
              }
            }}
          />
          {!readOnly ? (
            <span className="flex w-7 shrink-0 flex-col border-l border-plant-line">
              <button
                aria-label={`Increase ${label}`}
                className="flex h-[19px] items-center justify-center text-plant-cyan hover:bg-plant-cyan/10 disabled:opacity-30"
                disabled={parsedDraft !== undefined && max !== undefined && parsedDraft >= max}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => stepValue(1)}
                type="button"
              >
                <ChevronUp size={13} />
              </button>
              <button
                aria-label={`Decrease ${label}`}
                className="flex h-[19px] items-center justify-center border-t border-plant-line text-plant-cyan hover:bg-plant-cyan/10 disabled:opacity-30"
                disabled={parsedDraft !== undefined && min !== undefined && parsedDraft <= min}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => stepValue(-1)}
                type="button"
              >
                <ChevronDown size={13} />
              </button>
            </span>
          ) : null}
        </span>
        <span className="text-xs font-semibold text-plant-muted">{unit}</span>
      </div>
      {min !== undefined && max !== undefined && !readOnly ? (
        <div className="mt-2.5 flex items-center gap-2">
          <input
            type="range"
            min={min}
            max={max}
            step={integerOnly ? 1 : step}
            value={Number.isFinite(parsedDraft) ? clamp(parsedDraft!, min, max) : clamp(value, min, max)}
            onChange={(event) => {
              const numeric = Number(event.target.value);
              const rounded = integerOnly ? Math.round(numeric) : Number(numeric.toFixed(3));
              setDraft(formatMlNumber(rounded, integerOnly));
              setHasUncommittedDraft(false);
              onChange(rounded);
            }}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-plant-line accent-plant-cyan"
            aria-label={`${label} slider`}
          />
        </div>
      ) : null}
      {min !== undefined && max !== undefined ? (
        <span className={`mt-1.5 block text-[10px] ${hasRangeWarning ? "text-plant-amber font-medium" : "text-plant-muted"}`}>
          {hasRangeWarning ? "Outside verified training range - prediction may be unreliable." : `Verified range: ${min} to ${max} ${unit}`}
        </span>
      ) : null}
    </div>
  );
}

function ParameterChip({ label, value, unit = "" }: { label: string; value: unknown; unit?: string }) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return (
    <div className="rounded border border-plant-line bg-plant-void p-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-plant-muted">{label}</div>
      <div className="mt-1 font-mono text-sm text-plant-text">
        {fmtMaybe(value)}
        {unit ? <span className="ml-1 text-plant-muted">{unit}</span> : null}
      </div>
    </div>
  );
}

function OptimizationEngine() {
  const dataset = useTwinStore((state) => state.dataset);
  const parameters = useTwinStore((state) => state.parameters);
  const updatePendingParameter = useTwinStore((state) => state.updatePendingParameter);
  const applyToTwin = useTwinStore((state) => state.applyToTwin);
  const [modelMode, setModelMode] = useState<"physical" | "research">("physical");

  const handleApplyPhysicalParams = (params: { current: number; voltage: number; pulseOn: number; pulseOff: number }) => {
    updatePendingParameter("current", params.current);
    updatePendingParameter("voltage", params.voltage);
    updatePendingParameter("gapVoltage", params.voltage);
    updatePendingParameter("pulseOn", params.pulseOn);
    updatePendingParameter("pulseOff", params.pulseOff);
    applyToTwin();
  };

  const [objective, setObjective] = useState<OptimizationObjective>("balanced");
  const [mlInfo, setMlInfo] = useState<MlModelInfo | null>(null);
  const [mlMaterials, setMlMaterials] = useState<Record<string, MlMaterialTableEntry>>({});
  const [mlElectrodes, setMlElectrodes] = useState<Record<string, MlMaterialTableEntry>>({});
  const [mlSources, setMlSources] = useState<MlSourceInfo[]>([]);
  const [mlStatus, setMlStatus] = useState<"loading" | "ready" | "offline">("loading");
  const [selectedWorkpiece, setSelectedWorkpiece] = useState("");
  const [selectedElectrode, setSelectedElectrode] = useState("");
  const [selectedCoating, setSelectedCoating] = useState("");
  const [mlInputs, setMlInputs] = useState({
    current_A: Math.round(parameters.current),
    voltage_V: Math.round(parameters.voltage),
    ton_us: parameters.pulseOn,
  });
  const [mlPrediction, setMlPrediction] = useState<MlPredictionResult | null>(null);
  const [paperValidation, setPaperValidation] = useState<Array<{
    id: string; coating: string; current_A: number; voltage_V: number; ton_us: number;
    paper_mrr: number; paper_twr: number;
    predicted_mrr: number | null; predicted_twr: number | null;
    mrr_error_pct: number | null; twr_error_pct: number | null;
  }>>([]);
  const [mlError, setMlError] = useState("");
  const [mlBusy, setMlBusy] = useState(false);
  const result = useMemo(() => analyzeDatasetOptimization(dataset.rows, objective), [dataset.rows, objective]);
  const topRows = result.rankedSamples.slice(0, 5);
  const best = result.bestCondition;
  const objectiveLabel = optimizationObjectives.find((item) => item.id === objective)?.label ?? "Balanced Performance";
  const materialOptions = mlInfo?.materials.length ? mlInfo.materials : Object.keys(mlMaterials);
  const electrodeOptions = mlInfo?.electrodes.length ? mlInfo.electrodes : Object.keys(mlElectrodes);
  const inputRanges = getMlInputRanges();

  useEffect(() => {
    if (!dataset.loaded) setObjective("balanced");
  }, [dataset.loaded]);

  useEffect(() => {
    let cancelled = false;
    getMlHealth()
      .then(() => Promise.all([getMlModelInfo(), getMlMaterials(), getMlElectrodes(), getMlSources()]))
      .then(([info, materials, electrodes, sources]) => {
        if (cancelled) return;
        setMlInfo(info);
        setMlMaterials(materials);
        setMlElectrodes(electrodes);
        setMlSources(sources.length ? sources : info.sources ?? []);
        setSelectedWorkpiece((current) => current || info.materials[0] || Object.keys(materials)[0] || "");
        setSelectedElectrode((current) => current || info.electrodes[0] || Object.keys(electrodes)[0] || "");
        setSelectedCoating((current) => current || info.coatings?.[0] || "");
        setMlStatus("ready");
        setMlError("");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setMlStatus("offline");
        setMlError(error instanceof Error ? error.message : "Bundled browser model could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Compute Shailesh (2021) paper validation: run each real experimental row through the
  // frozen model and record predicted vs. paper values. Runs once when the model is ready.
  useEffect(() => {
    if (mlStatus !== "ready") return;
    const REAL_ROWS: Array<{ id: string; coating: string; current_A: number; voltage_V: number; ton_us: number; paper_mrr: number; paper_twr: number }> = [
      { id: "U-01", coating: "Uncoated",     current_A: 10, voltage_V: 40, ton_us: 100,  paper_mrr: 0.0020, paper_twr: 0.0023 },
      { id: "U-02", coating: "Uncoated",     current_A: 10, voltage_V: 45, ton_us: 500,  paper_mrr: 0.0022, paper_twr: 0.0028 },
      { id: "U-03", coating: "Uncoated",     current_A: 10, voltage_V: 50, ton_us: 1000, paper_mrr: 0.0019, paper_twr: 0.0041 },
      { id: "U-04", coating: "Uncoated",     current_A: 10, voltage_V: 55, ton_us: 1500, paper_mrr: 0.0027, paper_twr: 0.0029 },
      { id: "U-05", coating: "Uncoated",     current_A: 20, voltage_V: 45, ton_us: 100,  paper_mrr: 0.0019, paper_twr: 0.0050 },
      { id: "U-06", coating: "Uncoated",     current_A: 20, voltage_V: 40, ton_us: 500,  paper_mrr: 0.0073, paper_twr: 0.0058 },
      { id: "U-07", coating: "Uncoated",     current_A: 20, voltage_V: 55, ton_us: 1000, paper_mrr: 0.0075, paper_twr: 0.0076 },
      { id: "U-08", coating: "Uncoated",     current_A: 20, voltage_V: 50, ton_us: 1500, paper_mrr: 0.0111, paper_twr: 0.0087 },
      { id: "U-09", coating: "Uncoated",     current_A: 30, voltage_V: 50, ton_us: 100,  paper_mrr: 0.0053, paper_twr: 0.0068 },
      { id: "U-10", coating: "Uncoated",     current_A: 30, voltage_V: 55, ton_us: 500,  paper_mrr: 0.0097, paper_twr: 0.0098 },
      { id: "U-11", coating: "Uncoated",     current_A: 30, voltage_V: 40, ton_us: 1000, paper_mrr: 0.0141, paper_twr: 0.0118 },
      { id: "U-12", coating: "Uncoated",     current_A: 30, voltage_V: 45, ton_us: 1500, paper_mrr: 0.0172, paper_twr: 0.0124 },
      { id: "U-13", coating: "Uncoated",     current_A: 40, voltage_V: 55, ton_us: 100,  paper_mrr: 0.0093, paper_twr: 0.0106 },
      { id: "U-14", coating: "Uncoated",     current_A: 40, voltage_V: 50, ton_us: 500,  paper_mrr: 0.0164, paper_twr: 0.0145 },
      { id: "U-15", coating: "Uncoated",     current_A: 40, voltage_V: 45, ton_us: 1000, paper_mrr: 0.0229, paper_twr: 0.0177 },
      { id: "U-16", coating: "Uncoated",     current_A: 40, voltage_V: 40, ton_us: 1500, paper_mrr: 0.0282, paper_twr: 0.0212 },
      { id: "C-01", coating: "AlCrNi (PVD)", current_A: 10, voltage_V: 40, ton_us: 100,  paper_mrr: 0.0040, paper_twr: 0.0001 },
      { id: "C-02", coating: "AlCrNi (PVD)", current_A: 10, voltage_V: 45, ton_us: 500,  paper_mrr: 0.0093, paper_twr: 0.0002 },
      { id: "C-03", coating: "AlCrNi (PVD)", current_A: 10, voltage_V: 50, ton_us: 1000, paper_mrr: 0.0086, paper_twr: 0.0002 },
      { id: "C-04", coating: "AlCrNi (PVD)", current_A: 10, voltage_V: 55, ton_us: 1500, paper_mrr: 0.0065, paper_twr: 0.0003 },
      { id: "C-05", coating: "AlCrNi (PVD)", current_A: 20, voltage_V: 45, ton_us: 100,  paper_mrr: 0.0053, paper_twr: 0.0014 },
      { id: "C-06", coating: "AlCrNi (PVD)", current_A: 20, voltage_V: 40, ton_us: 500,  paper_mrr: 0.0107, paper_twr: 0.0022 },
      { id: "C-07", coating: "AlCrNi (PVD)", current_A: 20, voltage_V: 55, ton_us: 1000, paper_mrr: 0.0089, paper_twr: 0.0011 },
      { id: "C-08", coating: "AlCrNi (PVD)", current_A: 20, voltage_V: 50, ton_us: 1500, paper_mrr: 0.0148, paper_twr: 0.0022 },
      { id: "C-09", coating: "AlCrNi (PVD)", current_A: 30, voltage_V: 50, ton_us: 100,  paper_mrr: 0.0077, paper_twr: 0.0031 },
      { id: "C-10", coating: "AlCrNi (PVD)", current_A: 30, voltage_V: 55, ton_us: 500,  paper_mrr: 0.0106, paper_twr: 0.0041 },
      { id: "C-11", coating: "AlCrNi (PVD)", current_A: 30, voltage_V: 40, ton_us: 1000, paper_mrr: 0.0098, paper_twr: 0.0037 },
      { id: "C-12", coating: "AlCrNi (PVD)", current_A: 30, voltage_V: 45, ton_us: 1500, paper_mrr: 0.0099, paper_twr: 0.0046 },
      { id: "C-13", coating: "AlCrNi (PVD)", current_A: 40, voltage_V: 55, ton_us: 100,  paper_mrr: 0.0133, paper_twr: 0.0074 },
      { id: "C-14", coating: "AlCrNi (PVD)", current_A: 40, voltage_V: 50, ton_us: 500,  paper_mrr: 0.0125, paper_twr: 0.0081 },
      { id: "C-15", coating: "AlCrNi (PVD)", current_A: 40, voltage_V: 45, ton_us: 1000, paper_mrr: 0.0139, paper_twr: 0.0089 },
      { id: "C-16", coating: "AlCrNi (PVD)", current_A: 40, voltage_V: 40, ton_us: 1500, paper_mrr: 0.0121, paper_twr: 0.0095 },
    ];
    void Promise.all(
      REAL_ROWS.map(async (row) => {
        const result = await predictMl({
          workpiece_material: "Ti-6Al-4V",
          electrode_material: "Aluminium (Al)",
          electrode_coating: row.coating,
          current_A: row.current_A,
          voltage_V: row.voltage_V,
          ton_us: row.ton_us,
        });
        const pred_mrr = result.predicted_mrr;
        const pred_twr = result.predicted_twr;
        return {
          id: row.id,
          coating: row.coating,
          current_A: row.current_A,
          voltage_V: row.voltage_V,
          ton_us: row.ton_us,
          paper_mrr: row.paper_mrr,
          paper_twr: row.paper_twr,
          predicted_mrr: pred_mrr,
          predicted_twr: pred_twr,
          mrr_error_pct: pred_mrr !== null && row.paper_mrr > 0 ? Math.abs((pred_mrr - row.paper_mrr) / row.paper_mrr) * 100 : null,
          twr_error_pct: pred_twr !== null && row.paper_twr > 0 ? Math.abs((pred_twr - row.paper_twr) / row.paper_twr) * 100 : null,
        };
      })
    ).then((rows) => setPaperValidation(rows));
  }, [mlStatus]);

  const buildMlPayload = () => ({
    workpiece_material: selectedWorkpiece,
    electrode_material: selectedElectrode,
    electrode_coating: selectedCoating,
    current_A: Number(mlInputs.current_A),
    voltage_V: Number(mlInputs.voltage_V),
    ton_us: Number(mlInputs.ton_us),
  });

  const validMlInputs = (payload = buildMlPayload()) => {
    if (!selectedWorkpiece || !selectedElectrode || !selectedCoating) {
      setMlError("Select a dataset-supported workpiece, electrode, and coating condition before prediction.");
      return false;
    }
    if (![payload.current_A, payload.voltage_V, payload.ton_us].every(Number.isFinite)) {
      setMlError("Current, Voltage, and TON must each be complete numeric values before prediction.");
      return false;
    }
    return true;
  };

  const runMlPrediction = async () => {
    const payload = buildMlPayload();
    if (!validMlInputs(payload)) return;
    setMlBusy(true);
    setMlError("");
    try {
      setMlPrediction(await predictMl(payload));
    } catch (error) {
      setMlError(error instanceof Error ? error.message : "Prediction failed.");
    } finally {
      setMlBusy(false);
    }
  };



  const columns = [
    { key: "rank", label: "Rank", show: true, render: (_condition: RankedExperimentalCondition, index: number) => `#${index + 1}` },
    { key: "sample", label: "Sample", show: true, render: (condition: RankedExperimentalCondition) => String(condition.sample.t !== "" && condition.sample.t != null ? condition.sample.t : condition.rowIndex + 1) },
    { key: "current", label: "Current", show: fieldAvailable(topRows, (condition) => condition.sample.parameters.current), render: (condition: RankedExperimentalCondition) => fmtMaybe(condition.sample.parameters.current) },
    { key: "voltage", label: "Voltage", show: fieldAvailable(topRows, (condition) => condition.sample.parameters.voltage), render: (condition: RankedExperimentalCondition) => fmtMaybe(condition.sample.parameters.voltage) },
    { key: "pulseOn", label: "Ton", show: fieldAvailable(topRows, (condition) => condition.sample.parameters.pulseOn), render: (condition: RankedExperimentalCondition) => fmtMaybe(condition.sample.parameters.pulseOn) },
    { key: "pulseOff", label: "Toff", show: fieldAvailable(topRows, (condition) => condition.sample.parameters.pulseOff), render: (condition: RankedExperimentalCondition) => fmtMaybe(condition.sample.parameters.pulseOff) },
    { key: "mrr", label: "MRR", show: fieldAvailable(topRows, (condition) => condition.sample.metrics.mrr), render: (condition: RankedExperimentalCondition) => fmtMaybe(condition.sample.metrics.mrr) },
    { key: "twr", label: "TWR", show: fieldAvailable(topRows, (condition) => condition.sample.metrics.toolWearRate), render: (condition: RankedExperimentalCondition) => fmtMaybe(condition.sample.metrics.toolWearRate) },
    { key: "ra", label: "Ra", show: fieldAvailable(topRows, (condition) => condition.sample.metrics.surfaceRoughness), render: (condition: RankedExperimentalCondition) => fmtMaybe(condition.sample.metrics.surfaceRoughness) },
    { key: "score", label: "Score", show: true, render: (condition: RankedExperimentalCondition) => fmtMaybe(condition.score, 1) },
  ].filter((column) => column.show);

  return (
    <Panel
      title={modelMode === "physical" ? "Physical EDM Machine ML Engine" : "EDM Parameter Optimization Engine"}
      eyebrow={modelMode === "physical" ? "Authoritative physical readings Random Forest (Target: ≤ 5.0% error)" : "Multi-objective experimental performance analysis (Shailesh 2021)"}
      accent={modelMode === "physical" ? "cyan" : "violet"}
    >
      <div className="space-y-4">
        {/* Dual-Model Mode Switcher */}
        <div className="rounded-lg border border-plant-line bg-plant-void/80 p-2.5">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-plant-muted">
              Select ML Model Architecture
            </span>
            <span className="text-[11px] font-mono text-plant-muted">
              Active: <strong className={modelMode === "physical" ? "text-plant-cyan" : "text-plant-violet"}>{modelMode === "physical" ? "Mode B (Physical Machine)" : "Mode A (Research Paper)"}</strong>
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
            <button
              type="button"
              onClick={() => setModelMode("physical")}
              className={`flex items-start gap-3 rounded-lg border p-3.5 text-left transition-all ${
                modelMode === "physical"
                  ? "border-plant-cyan/60 bg-plant-deck shadow-md shadow-plant-cyan/10"
                  : "border-plant-line/60 bg-plant-deck/40 text-plant-muted hover:border-plant-line hover:text-plant-text"
              }`}
            >
              <div className={`mt-0.5 rounded-md p-2 ${modelMode === "physical" ? "bg-plant-cyan/20 text-plant-cyan" : "bg-plant-void text-plant-muted"}`}>
                <Cpu size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-xs font-bold uppercase tracking-wider ${modelMode === "physical" ? "text-plant-cyan" : "text-plant-text"}`}>
                    Mode B: Physical Machine Model
                  </span>
                  <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400">
                    REAL EXPERIMENTS
                  </span>
                </div>
                <div className="mt-1 text-[11px] leading-relaxed text-plant-muted">
                  Trained on 36 authoritative physical EDM runs (EN-31 die steel, brass electrode, EDM oil).
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-plant-muted">
                  <span>Inputs: <span className="text-plant-text">Ip, Vg, TON, TOFF</span></span>
                  <span>•</span>
                  <span>Outputs: <span className="text-plant-cyan font-bold">MRR (g/min), TWR (g/min)</span></span>
                  <span>•</span>
                  <span>Target: <span className="text-emerald-400">≤ 5.0% error</span></span>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setModelMode("research")}
              className={`flex items-start gap-3 rounded-lg border p-3.5 text-left transition-all ${
                modelMode === "research"
                  ? "border-plant-violet/60 bg-plant-deck shadow-md shadow-plant-violet/10"
                  : "border-plant-line/60 bg-plant-deck/40 text-plant-muted hover:border-plant-line hover:text-plant-text"
              }`}
            >
              <div className={`mt-0.5 rounded-md p-2 ${modelMode === "research" ? "bg-plant-violet/20 text-plant-violet" : "bg-plant-void text-plant-muted"}`}>
                <BookOpen size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-xs font-bold uppercase tracking-wider ${modelMode === "research" ? "text-plant-violet" : "text-plant-text"}`}>
                    Mode A: Research Paper Model
                  </span>
                  <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-violet-400">
                    SHAILESH 2021
                  </span>
                </div>
                <div className="mt-1 text-[11px] leading-relaxed text-plant-muted">
                  Published research dataset (Ti-6Al-4V workpiece, Al coated/uncoated electrode).
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-plant-muted">
                  <span>Inputs: <span className="text-plant-text">Ip, Vg, TON (+ Materials)</span></span>
                  <span>•</span>
                  <span>Outputs: <span className="text-plant-violet font-bold">MRR (mm³/min), TWR (%/min)</span></span>
                  <span>•</span>
                  <span>Runs: <span className="text-plant-text">32 conditions</span></span>
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* View Mode Content Container */}
        <div className={modelMode === "physical" ? "block" : "hidden"}>
          <PhysicalMachineMlPanel onApplyToMachine={handleApplyPhysicalParams} />
        </div>

        <div className={modelMode === "research" ? "block space-y-4" : "hidden"}>
          <div className="rounded border border-plant-line bg-plant-deck p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-plant-muted">ML Prediction</div>
              <div className="mt-1 text-sm text-plant-text">Set the EDM machining condition to predict material removal and tool wear.</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusPill label={mlStatus === "ready" ? "BROWSER ML READY" : mlStatus === "loading" ? "LOADING MODEL" : "MODEL UNAVAILABLE"} tone={mlStatus === "ready" ? "green" : mlStatus === "loading" ? "amber" : "red"} />
            </div>
          </div>

          <p className="mt-3 text-xs leading-5 text-plant-muted">Select the material condition and enter the EDM process parameters.</p>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded border border-plant-line bg-plant-void p-3">
              <div className="text-[10px] uppercase tracking-[0.16em] text-plant-muted">1. Workpiece Material</div>
              <select className="mt-2 h-10 w-full rounded border border-plant-line bg-plant-deck px-2 text-sm text-plant-text outline-none" value={selectedWorkpiece} onChange={(event) => setSelectedWorkpiece(event.target.value)}>
                {materialOptions.map((item) => <option key={item}>{item}</option>)}
              </select>
            </div>

            <div className="rounded border border-plant-line bg-plant-void p-3">
              <div className="text-[10px] uppercase tracking-[0.16em] text-plant-muted">2. Electrode Material</div>
              <select className="mt-2 h-10 w-full rounded border border-plant-line bg-plant-deck px-2 text-sm text-plant-text outline-none" value={selectedElectrode} onChange={(event) => setSelectedElectrode(event.target.value)}>
                {electrodeOptions.map((item) => <option key={item}>{item}</option>)}
              </select>
            </div>

            <div className="rounded border border-plant-line bg-plant-void p-3">
              <div className="text-[10px] uppercase tracking-[0.16em] text-plant-muted">3. Electrode Coating</div>
              <select className="mt-2 h-10 w-full rounded border border-plant-line bg-plant-deck px-2 text-sm text-plant-text outline-none" value={selectedCoating} onChange={(event) => setSelectedCoating(event.target.value)}>
                {(mlInfo?.coatings ?? []).map((item) => <option key={item}>{item}</option>)}
              </select>
            </div>
          </div>

          <div className="mt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-plant-muted">4. EDM Process Parameters</div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <MlNumberInput label="Current" unit="A" min={inputRanges.current_A.min} max={inputRanges.current_A.max} step={1} integerOnly value={mlInputs.current_A} onChange={(value) => setMlInputs((state) => ({ ...state, current_A: value }))} onEnter={runMlPrediction} />
            <MlNumberInput label="Voltage" unit="V" min={inputRanges.voltage_V.min} max={inputRanges.voltage_V.max} step={1} integerOnly value={mlInputs.voltage_V} onChange={(value) => setMlInputs((state) => ({ ...state, voltage_V: value }))} onEnter={runMlPrediction} />
            <MlNumberInput label="TON" unit="us" min={inputRanges.ton_us.min} max={inputRanges.ton_us.max} step={1} integerOnly value={mlInputs.ton_us} onChange={(value) => setMlInputs((state) => ({ ...state, ton_us: value }))} onEnter={runMlPrediction} />
          </div>

          <div className="mt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-plant-muted">5. Prediction Result</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="rounded bg-plant-cyan px-3 py-2 text-xs font-semibold uppercase text-plant-void disabled:cursor-not-allowed disabled:opacity-40" disabled={mlStatus !== "ready" || mlBusy} onClick={runMlPrediction} type="button">
              {mlBusy ? "Predicting..." : "Predict MRR & TWR"}
            </button>
          </div>

          {mlError ? <div className="mt-3 rounded border border-plant-red/60 bg-plant-red/10 p-3 text-sm text-plant-red">{mlError}</div> : null}
          {mlPrediction ? (
            <>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
              <MetricCard label="Predicted MRR" value={fmtMaybe(mlPrediction.predicted_mrr, 5)} unit={mlPrediction.predicted_mrr === null ? "Not reportable" : mlPrediction.mrr_unit} tone={mlPrediction.predicted_mrr === null ? "red" : "amber"} sublabel={mlPrediction.predicted_mrr !== null && mlPrediction.coverage.mrr_supported ? "ML prediction" : "Unreportable or insufficient coverage"} />
              <MetricCard label="Predicted TWR" value={fmtMaybe(mlPrediction.predicted_twr, 5)} unit={mlPrediction.predicted_twr === null ? "Not reportable" : mlPrediction.twr_unit} tone={mlPrediction.predicted_twr === null ? "red" : "amber"} sublabel={mlPrediction.predicted_twr !== null && mlPrediction.coverage.twr_supported ? mlPrediction.domain_status : "Unreportable or unavailable"} />
              <MetricCard label="Research Coverage" value={mlPrediction.coverage.mrr_supported && mlPrediction.coverage.twr_supported && mlPrediction.predicted_mrr !== null && mlPrediction.predicted_twr !== null ? "DIRECT PAIR" : "LIMITED"} tone={mlPrediction.coverage.mrr_supported && mlPrediction.coverage.twr_supported && mlPrediction.predicted_mrr !== null && mlPrediction.predicted_twr !== null ? "amber" : "red"} sublabel={mlPrediction.coverage.combination} />
              </div>
            </>
          ) : null}
          {(mlPrediction?.warnings.length) ? (
            <div className="mt-3 rounded border border-plant-amber/60 bg-plant-amber/10 p-3 text-xs leading-5 text-plant-amber">
              {[...(mlPrediction?.warnings ?? [])].slice(0, 6).map((warning) => (
                <div key={warning}>{warning}</div>
              ))}
            </div>
          ) : null}

          {/* ── Research Paper Validation ─────────────────────────────────────── */}
          {paperValidation.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded border border-plant-line bg-plant-void p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-plant-muted">Research Paper Validation</div>
                  <p className="mt-1 text-xs leading-5 text-plant-muted">
                    Shirguppikar et al. (2021), Table 4 — Ti-6Al-4V | Aluminium (Al) | 32 real experiments.
                    Predicted values come from the frozen ML model. Error is |predicted − paper| / paper × 100.
                    Note: the model was trained on these rows — this is an in-sample fidelity check, not a generalization claim.
                  </p>
                </div>
              </div>
              <table className="mt-3 min-w-[860px] w-full text-left text-xs">
                <thead className="border-b border-plant-line text-[10px] uppercase tracking-[0.12em] text-plant-muted">
                  <tr>
                    <th className="p-2">Expt</th>
                    <th className="p-2">Coating</th>
                    <th className="p-2 text-right">I (A)</th>
                    <th className="p-2 text-right">V (V)</th>
                    <th className="p-2 text-right">TON (µs)</th>
                    <th className="p-2 text-right">Paper MRR</th>
                    <th className="p-2 text-right">Pred MRR</th>
                    <th className="p-2 text-right">MRR Err%</th>
                    <th className="p-2 text-right">Paper TWR</th>
                    <th className="p-2 text-right">Pred TWR</th>
                    <th className="p-2 text-right">TWR Err%</th>
                  </tr>
                </thead>
                <tbody>
                  {paperValidation.map((row) => {
                    const mrrOk = row.mrr_error_pct !== null && row.mrr_error_pct < 15;
                    const twrOk = row.twr_error_pct !== null && row.twr_error_pct < 15;
                    return (
                      <tr key={row.id} className="border-b border-plant-line/60 text-plant-text hover:bg-plant-deck/40">
                        <td className="p-2 font-mono text-plant-muted">{row.id}</td>
                        <td className="p-2">{row.coating === "Uncoated" ? "Uncoated" : "AlCrNi"}</td>
                        <td className="p-2 text-right">{row.current_A}</td>
                        <td className="p-2 text-right">{row.voltage_V}</td>
                        <td className="p-2 text-right">{row.ton_us}</td>
                        <td className="p-2 text-right font-mono">{row.paper_mrr.toFixed(4)}</td>
                        <td className="p-2 text-right font-mono">{row.predicted_mrr !== null ? row.predicted_mrr.toFixed(4) : "—"}</td>
                        <td className={`p-2 text-right font-mono ${row.mrr_error_pct === null ? "text-plant-muted" : mrrOk ? "text-plant-green" : "text-plant-amber"}`}>
                          {row.mrr_error_pct !== null ? `${row.mrr_error_pct.toFixed(1)}%` : "—"}
                        </td>
                        <td className="p-2 text-right font-mono">{row.paper_twr.toFixed(4)}</td>
                        <td className="p-2 text-right font-mono">{row.predicted_twr !== null ? row.predicted_twr.toFixed(4) : "—"}</td>
                        <td className={`p-2 text-right font-mono ${row.twr_error_pct === null ? "text-plant-muted" : twrOk ? "text-plant-green" : "text-plant-amber"}`}>
                          {row.twr_error_pct !== null ? `${row.twr_error_pct.toFixed(1)}%` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Model & Research Details ─────────────────────────────────────── */}
          <details className="mt-4 rounded border border-plant-line bg-plant-void p-4">
            <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.18em] text-plant-muted">Model &amp; Research Details</summary>
            {mlInfo ? (
              <>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Spec label="MRR model" value={mlInfo.selected_models?.mrr?.model_type ?? mlInfo.metrics.mrr.model ?? "Not recorded"} />
                  <Spec label="TWR model" value={mlInfo.selected_models?.twr?.model_type ?? mlInfo.metrics.twr.model ?? "Not recorded"} />
                  <Spec label="MRR source validation" value={`MAE ${fmtMaybe(mlInfo.metrics.mrr.grouped_by_source?.mae)}, RMSE ${fmtMaybe(mlInfo.metrics.mrr.grouped_by_source?.rmse)}, R2 ${fmtMaybe(mlInfo.metrics.mrr.grouped_by_source?.r2)}`} />
                  <Spec label="TWR source validation" value={`MAE ${fmtMaybe(mlInfo.metrics.twr.grouped_by_source?.mae)}, RMSE ${fmtMaybe(mlInfo.metrics.twr.grouped_by_source?.rmse)}, R2 ${fmtMaybe(mlInfo.metrics.twr.grouped_by_source?.r2)}`} />
                </div>
                <div className="mt-3 rounded border border-plant-amber/50 bg-plant-amber/10 p-3 text-xs leading-5 text-plant-amber">
                  <div className="font-semibold uppercase tracking-wide">Model limitations</div>
                  <div>Shailesh-Sir single-source training: {mlInfo.real_row_count ?? 0} real observations, {mlInfo.synthetic_row_count ?? 0} supplied synthetic augmentation rows, {mlInfo.materials.length} workpiece, and {mlInfo.electrodes.length} electrode base material.</div>
                  <div>Generalization uses real-only coating-stratified folds. Responses are source-reported mass rates in g/min; no unsupported mm3/min conversion is shown.</div>
                </div>
              </>
            ) : null}
            <div className="mt-3 space-y-2">
              {mlSources.length ? (
                mlSources.map((source) => (
                  <div key={source.source_id} className="rounded border border-plant-line bg-plant-deck p-3">
                    <div className="text-sm font-semibold text-plant-text">{source.title}</div>
                    <div className="mt-1 text-xs leading-5 text-plant-muted">
                      {source.year} | {source.doi || source.url || source.source_id} | {source.workpiece} | {source.electrodes} | {source.observations_used} rows
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-plant-muted">No bundled research-source records are available.</div>
              )}
            </div>
          </details>
        </div>

        {!dataset.loaded ? (
        <div className="rounded border border-dashed border-plant-line bg-plant-void p-5">
          <div className="text-sm font-semibold uppercase tracking-wide text-plant-muted">Status: Waiting For Dataset</div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-plant-text">
            Upload an experimental dataset to identify optimal observed machining conditions.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {optimizationObjectives.map((item) => {
              const disabled =
                (item.id === "max-mrr" && !result.availableMetrics.mrr) ||
                (item.id === "min-twr" && !result.availableMetrics.twr) ||
                (item.id === "best-surface" && !result.availableMetrics.surfaceRoughness);
              return (
                <button
                  key={item.id}
                  className={`rounded border px-3 py-2 text-xs font-semibold uppercase tracking-wide transition ${
                    objective === item.id ? "border-plant-violet bg-plant-violet/15 text-plant-violet" : "border-plant-line text-plant-muted hover:text-plant-text"
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                  disabled={disabled}
                  onClick={() => setObjective(item.id)}
                  type="button"
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {!best ? (
            <div className="rounded border border-plant-amber/60 bg-plant-amber/10 p-4 text-sm text-plant-amber">{result.message}</div>
          ) : (
            <>
              <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded border border-plant-line bg-plant-deck p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-plant-muted">Optimal Observed Condition</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusPill label={sampleLabel(best)} tone="violet" />
                    <StatusPill label={`Score ${fmtMaybe(best.score, 1)} / 100`} tone="green" />
                    <StatusPill label={`Objective ${objectiveLabel}`} tone="cyan" />
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <ParameterChip label="Current" value={best.sample.parameters.current} unit="A" />
                    <ParameterChip label="Voltage" value={best.sample.parameters.voltage} unit="V" />
                    <ParameterChip label="Gap Voltage" value={best.sample.parameters.gapVoltage} unit="V" />
                    <ParameterChip label="Pulse ON" value={best.sample.parameters.pulseOn} unit="us" />
                    <ParameterChip label="Pulse OFF" value={best.sample.parameters.pulseOff} unit="us" />
                    <ParameterChip label="Duty Cycle" value={best.sample.metrics.dutyCycle} unit="%" />
                    <ParameterChip label="Gap Distance" value={best.sample.parameters.gapDistance} unit="mm" />
                    <ParameterChip label="Servo Feed" value={best.sample.parameters.servoFeed} />
                    <ParameterChip label="Tool Diameter" value={best.sample.parameters.toolDiameter} unit="mm" />
                    <ParameterChip label="Pressure" value={best.sample.parameters.pressure} unit="bar" />
                    <ParameterChip label="Flow" value={best.sample.parameters.flowRate} unit="L/min" />
                    <ParameterChip label="Conductivity" value={best.sample.parameters.conductivity} unit="uS/cm" />
                    <ParameterChip label="Open Circuit Voltage" value={best.sample.parameters.openCircuitVoltage} unit="V" />
                    <ParameterChip label="Depth of Cut" value={best.sample.parameters.depthOfCut} unit="mm" />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="rounded border border-plant-line bg-plant-deck p-4">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-plant-muted">Resulting Performance</div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <ParameterChip label="MRR" value={best.sample.metrics.mrr} unit="mm3/min" />
                      <ParameterChip label="TWR" value={best.sample.metrics.toolWearRate} />
                      <ParameterChip label="Surface Roughness" value={best.sample.metrics.surfaceRoughness} unit="um" />
                      <ParameterChip label="Machine Health" value={best.sample.metrics.machineHealth} unit="%" />
                      <ParameterChip label="Gap Stability" value={best.sample.metrics.gapStability} unit="%" />
                      <ParameterChip label="Temperature" value={best.sample.metrics.dielectricTemperature} unit="degC" />
                    </div>
                  </div>
                  <SpecBlock title="Why This Condition?" value={result.explanation} tone="cyan" />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Spec label="Basis" value="Optimal Observed Condition" />
                    <Spec label="Dataset" value={dataset.fileName ?? "Uploaded dataset"} />
                    <Spec label="Valid Samples" value={`${result.validSampleCount} / ${dataset.rows.length}`} />
                    <Spec label="Excluded Samples" value={`${result.excludedSampleCount}`} />
                  </div>
                  <div className="text-xs leading-5 text-plant-muted">{result.message}</div>
                </div>
              </div>

              <div className="rounded border border-plant-line bg-plant-deck p-4">
                <div className="mb-3 text-sm font-semibold uppercase tracking-wide text-plant-text">Top Experimental Conditions</div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse text-sm">
                    <thead className="bg-plant-void text-left text-[10px] uppercase tracking-wide text-plant-muted">
                      <tr>
                        {columns.map((column) => (
                          <th key={column.key} className="border border-plant-line p-2">{column.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {topRows.map((condition, index) => (
                        <tr key={`${condition.rowIndex}-${condition.score}`} className="font-mono text-plant-text">
                          {columns.map((column) => (
                            <td key={column.key} className="border border-plant-line p-2">{column.render(condition, index)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
        </div>
      </div>
    </Panel>
  );
}
function LiveCommandPanel() {
  const [commandNotice, setCommandNotice] = useState("");
  const dataMode = useTwinStore((state) => state.dataMode);
  const connectionStatus = useTwinStore((state) => state.connectionStatus);
  const machineState = useTwinStore((state) => state.machineState);
  const telemetry = useTwinStore((state) => state.unityTelemetry);
  const cameraView = useTwinStore((state) => state.cameraView);
  const unityWebGLReady = useTwinStore((state) => state.unityWebGLReady);
  const commandDisabled = dataMode !== "live-unity" || (connectionStatus !== "connected" && !unityWebGLReady);

  const commands = [
    ["Start", startLiveMachining, "green"],
    ["Stop", stopLiveMachining, "amber"],
    ["Pause", pauseLiveMachine, "cyan"],
    ["Resume", resumeLiveMachine, "green"],
    ["Home", homeLiveMachine, "violet"],
    ["Reset", resetLiveMachine, "cyan"],
    ["Emergency Stop", emergencyStopLiveMachine, "red"],
  ] as const;
  const cameraViews: Array<[string, CameraView]> = [
    ["Front", "front"],
    ["Top", "top"],
    ["Side", "side"],
    ["Tool", "tool"],
    ["Iso", "isometric"],
    ["Free", "free"],
  ];
  const runCommand = (label: string, command: () => boolean) => {
    const sent = command();
    setCommandNotice(sent ? "" : `${label} is unavailable because the native Unity WebSocket gateway is not connected.`);
  };

  return (
    <Panel title="Live Unity Commands" eyebrow="Website controls Unity machine" accent="cyan">
      <div className="space-y-4">
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-plant-muted">Machine commands</div>
          <div className="grid grid-cols-2 gap-2">
          {commands.map(([label, command, tone]) => (
            <button
              key={label}
              className={`min-h-10 rounded border px-2 py-2 text-xs font-semibold uppercase tracking-wide transition ${
                tone === "red"
                  ? "col-span-2 border-plant-red bg-plant-red/15 text-plant-red"
                  : tone === "green"
                    ? "border-plant-green bg-plant-green/15 text-plant-green"
                    : tone === "amber"
                      ? "border-plant-amber bg-plant-amber/15 text-plant-amber"
                      : "border-plant-cyan bg-plant-cyan/15 text-plant-cyan"
              } disabled:cursor-not-allowed disabled:opacity-40`}
              disabled={commandDisabled}
              onClick={() => runCommand(label, command)}
              type="button"
            >
              {label}
            </button>
          ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-plant-muted">Camera</div>
          <div className="grid grid-cols-3 gap-2">
          {cameraViews.map(([label, view]) => (
            <button
              key={view}
              className={`min-h-9 rounded border px-2 py-2 text-xs font-semibold uppercase tracking-wide transition ${
                cameraView === view ? "border-plant-cyan bg-plant-cyan/15 text-plant-cyan" : "border-plant-line text-plant-muted hover:text-plant-text"
              }`}
              onClick={() => runCommand(`${label} camera`, () => setLiveCameraView(view))}
              type="button"
            >
              {label}
            </button>
          ))}
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <StatusPill label={`State ${machineState}`} tone={machineState === "MACHINING" ? "green" : machineState === "EMERGENCY_STOP" ? "red" : "cyan"} />
          <StatusPill label={`Progress ${fmt(telemetry.progressPercent || telemetry.cyclePercent, 0)}%`} tone="amber" />
          <StatusPill label={`Elapsed ${secondsLabel(telemetry.elapsedTimeSeconds)}`} tone="cyan" />
          <StatusPill label={`Remaining ${secondsLabel(telemetry.remainingTimeSeconds)}`} tone="amber" />
          <StatusPill label={`Tool ${fmt(telemetry.toolPosition, 2)}`} tone="violet" />
          <StatusPill label={`Spark ${telemetry.sparkActive ? "On" : "Off"}`} tone={telemetry.sparkActive ? "green" : "red"} />
        </div>
        {commandNotice ? <div className="rounded border border-plant-amber/60 bg-plant-amber/10 p-2 text-xs leading-5 text-plant-amber">{commandNotice}</div> : null}
      </div>
    </Panel>
  );
}

function MachineControl() {
  const [confirming, setConfirming] = useState(false);
  const dataMode = useTwinStore((state) => state.dataMode);
  const parameters = useTwinStore((state) => state.parameters);
  const pending = useTwinStore((state) => state.pendingParameters);
  const elapsedSeconds = useTwinStore((state) => state.elapsedSeconds);
  const validation = useTwinStore((state) => state.validation);
  const updatePendingParameter = useTwinStore((state) => state.updatePendingParameter);
  const resetPending = useTwinStore((state) => state.resetPending);
  const applyToTwin = useTwinStore((state) => state.applyToTwin);
  const whatIf = useMemo(() => compareWhatIf(parameters, pending, elapsedSeconds), [parameters, pending, elapsedSeconds]);

  return (
    <Panel
      title="Parameter Control"
      eyebrow="Edit, preview, validate, confirm"
      accent="amber"
      action={
        <div className="flex gap-2">
          <button className="rounded border border-plant-line px-3 py-1.5 text-xs text-plant-muted hover:text-plant-text" onClick={resetPending} type="button">
            Reset
          </button>
          <button className="rounded bg-plant-cyan px-3 py-1.5 text-xs font-semibold uppercase text-plant-void" onClick={() => setConfirming(true)} type="button">
            Preview Apply
          </button>
        </div>
      }
    >
      <div className="grid gap-3 xl:grid-cols-2">
        <ParameterStepper id="voltage" label="Voltage" unit="V" min={40} max={160} step={0.5} decimals={2} />
        <ParameterStepper id="current" label="Current" unit="A" min={2} max={35} step={0.5} />
        <ParameterStepper id="gapVoltage" label="Gap Voltage" unit="V" min={20} max={140} step={0.5} decimals={2} />
        <ParameterStepper id="pulseOn" label="Pulse ON" unit="us" min={20} max={300} step={0.25} decimals={2} />
        <ParameterStepper id="pulseOff" label="Pulse OFF" unit="us" min={10} max={180} step={0.25} decimals={2} />
        <ParameterStepper id="gapDistance" label="Gap Distance" unit="mm" min={0.02} max={0.5} step={0.005} decimals={3} />
        <ParameterStepper id="servoFeed" label="Servo Feed" unit="mm/min" min={0.02} max={1.2} step={0.02} decimals={2} />
        <ParameterStepper id="toolDiameter" label="Tool Diameter" unit="mm" min={0.2} max={40} step={0.1} />
        <ParameterStepper id="pressure" label="Pressure" unit="bar" min={0.5} max={8} step={0.1} />
        <ParameterStepper id="flowRate" label="Flow" unit="L/min" min={1} max={20} step={0.2} />
        <ParameterStepper id="conductivity" label="Conductivity" unit="uS/cm" min={0.5} max={18} step={0.5} />
        <ParameterStepper id="openCircuitVoltage" label="Open Circuit Voltage" unit="V" min={70} max={140} step={0.5} decimals={2} />
        <ParameterStepper id="depthOfCut" label="Depth of Cut" unit="mm" min={0.5} max={80} step={0.5} />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <SelectControl label="Electrode" value={pending.electrodeMaterial} options={electrodeMaterials} onChange={(value) => updatePendingParameter("electrodeMaterial", value as MachineParameters["electrodeMaterial"])} />
        <SelectControl label="Workpiece" value={pending.workpieceMaterial} options={workpieceMaterials} onChange={(value) => updatePendingParameter("workpieceMaterial", value as MachineParameters["workpieceMaterial"])} />
        <SelectControl label="Machining Mode" value={pending.machiningMode} options={machineModes} onChange={(value) => updatePendingParameter("machiningMode", value as MachineMode)} />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <MetricCard label="Predicted MRR" value={fmt(whatIf.predicted.mrr, 2)} unit="mm3/min" tone="green" sublabel={`Delta ${fmt(whatIf.predicted.mrr - whatIf.current.mrr, 2)}`} />
        <MetricCard label="Predicted Ra" value={fmt(whatIf.predicted.surfaceRoughness, 2)} unit="um" tone="cyan" sublabel={`Delta ${fmt(whatIf.predicted.surfaceRoughness - whatIf.current.surfaceRoughness, 2)}`} />
        <MetricCard label="Tool Wear" value={fmt(whatIf.predicted.electrodeWearRatio, 2)} unit="%" tone="amber" sublabel={`Delta ${fmt(whatIf.predicted.electrodeWearRatio - whatIf.current.electrodeWearRatio, 2)}`} />
        <MetricCard label="Validation" value={fmt(validation.confidence, 0)} unit="%" tone={validation.physicsValid && validation.aiValid ? "green" : "amber"} sublabel={validation.warnings[0] ?? "Physics and AI checks passed"} />
      </div>
      {confirming ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-xl rounded border border-plant-cyan bg-plant-panel shadow-glow">
            <div className="flex items-center justify-between border-b border-plant-line px-4 py-3">
              <div>
                <div className="text-sm font-semibold uppercase text-plant-cyan">Apply to Digital Twin</div>
                <div className="text-xs text-plant-muted">Physical machine application remains locked out.</div>
              </div>
              <button onClick={() => setConfirming(false)} type="button" aria-label="Close confirmation">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3 p-4">
              <StatusPill label={validation.physicsValid ? "Engineering Validated" : "Engineering Warnings"} tone={validation.physicsValid ? "green" : "amber"} />
              <StatusPill label={validation.aiValid ? "AI Validation Passed" : "AI Review Required"} tone={validation.aiValid ? "green" : "amber"} />
              <ul className="space-y-2 text-sm text-plant-muted">
                {(validation.warnings.length ? validation.warnings : ["No validation warnings. Parameter set remains inside qualified process envelope."]).map((item) => (
                  <li key={item} className="rounded border border-plant-line bg-plant-deck p-2">{item}</li>
                ))}
              </ul>
              <div className="flex justify-end gap-2">
                <button className="rounded border border-plant-line px-4 py-2 text-sm text-plant-muted" onClick={() => setConfirming(false)} type="button">Cancel</button>
                <button
                  className="rounded bg-plant-cyan px-4 py-2 text-sm font-semibold uppercase text-plant-void"
                  onClick={() => {
                    if (dataMode === "live-unity") {
                      machineParameterService.applyParameters(pending);
                    }
                    applyToTwin();
                    setConfirming(false);
                  }}
                  type="button"
                >
                  Apply to Twin
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

function SelectControl({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="block rounded border border-plant-line bg-plant-deck p-3">
      <span className="text-[10px] uppercase tracking-[0.16em] text-plant-muted">{label}</span>
      <select className="mt-2 h-10 w-full rounded border border-plant-line bg-plant-void px-2 text-sm text-plant-text outline-none" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function SensorFusion() {
  const [group, setGroup] = useState<string>("ALL");
  const [activeSensor, setActiveSensor] = useState(sensors[0]);
  const visibleSensors = group === "ALL" ? sensors : sensors.filter((sensor) => sensor.group === group);
  const mvpOnline = sensors.filter((sensor) => sensor.mvp).length;

  return (
    <Panel title="Sensor Fusion" eyebrow="Electrical, mechanical, thermal, fluid, optical" accent="green">
      <div className="mb-3 flex flex-wrap gap-2">
        <button className={`rounded border px-3 py-1.5 text-xs ${group === "ALL" ? "border-plant-cyan text-plant-cyan" : "border-plant-line text-plant-muted"}`} onClick={() => setGroup("ALL")} type="button">
          All 19
        </button>
        {sensorGroups.map((item) => (
          <button
            key={item.name}
            className={`rounded border px-3 py-1.5 text-xs ${group === item.name ? "border-plant-cyan text-plant-cyan" : "border-plant-line text-plant-muted"}`}
            onClick={() => setGroup(item.name)}
            type="button"
          >
            {item.name}
          </button>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(360px,0.9fr)_1.1fr]">
        <SensorDiagram sensors={visibleSensors} activeSensor={activeSensor} onSelect={setActiveSensor} />
        <div className="space-y-3">
          <div className="rounded border border-plant-line bg-plant-deck p-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill label={activeSensor.id} tone="cyan" />
              <StatusPill label={activeSensor.group} tone="violet" />
              {activeSensor.mvp ? <StatusPill label="MVP" tone="green" /> : null}
            </div>
            <h3 className="mt-3 text-lg font-semibold text-plant-text">{activeSensor.name}</h3>
            <p className="mt-1 text-sm text-plant-muted">{activeSensor.model}</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Spec label="Parameter" value={activeSensor.parameter} />
              <Spec label="Range" value={activeSensor.range} />
              <Spec label="Accuracy" value={activeSensor.accuracy} />
              <Spec label="Sample Rate" value={activeSensor.sampleRate} />
              <Spec label="Protocol" value={activeSensor.protocol} />
              <Spec label="Zone" value={activeSensor.zone} />
            </div>
          </div>
          <SpecBlock title="Installation Location" value={activeSensor.location} tone="green" />
          <SpecBlock title="Installation Tip" value={activeSensor.installTip} tone="amber" />
          <SpecBlock title="Purpose in Digital Twin" value={activeSensor.purpose} tone="cyan" />
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard label="Sensor Health" value="98" unit="%" tone="green" sublabel={`${mvpOnline} MVP sensors online`} />
            <MetricCard label="Signal Quality" value="94" unit="%" tone="cyan" sublabel="Fused confidence" />
            <MetricCard label="Calibration" value="173" unit="days" tone="amber" sublabel="Until six-month audit" />
          </div>
        </div>
      </div>
    </Panel>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-plant-line bg-plant-void p-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-plant-muted">{label}</div>
      <div className="mt-1 text-sm text-plant-text">{value}</div>
    </div>
  );
}

function SpecBlock({ title, value, tone }: { title: string; value: string; tone: "cyan" | "amber" | "green" }) {
  const color = tone === "cyan" ? "border-l-plant-cyan" : tone === "amber" ? "border-l-plant-amber" : "border-l-plant-green";
  return (
    <div className={`rounded border border-plant-line border-l-2 ${color} bg-plant-deck p-3`}>
      <div className="text-[10px] uppercase tracking-[0.16em] text-plant-muted">{title}</div>
      <div className="mt-1 text-sm leading-6 text-plant-text">{value}</div>
    </div>
  );
}

function AICopilot() {
  const metrics = useTwinStore((state) => state.metrics);
  const parameters = useTwinStore((state) => state.parameters);
  const history = useTwinStore((state) => state.history);
  const dataMode = useTwinStore((state) => state.dataMode);
  const dataset = useTwinStore((state) => state.dataset);
  const previous = history.length > 1 ? history[history.length - 2] : null;

  // Build honest observations explicitly labeled with their true source
  let mrrText = "";
  let stabilityText = "";

  if (dataMode === "live-unity") {
    mrrText = `Live ESP32 telemetry is connected. Current MRR is calculated at ${fmt(metrics.mrr, 2)} mm3/min.`;
  } else if (dataMode === "dataset" && dataset.loaded) {
    const mrrDelta = previous ? metrics.mrr - previous.mrr : 0;
    mrrText = `Dataset sample ${dataset.index + 1}/${dataset.rows.length}: Measured MRR is ${fmt(metrics.mrr, 2)} mm3/min${previous ? ` (${mrrDelta >= 0 ? "+" : ""}${fmt(mrrDelta, 2)} from previous sample)` : ""}.`;
  } else {
    mrrText = `Dashboard is in Simulation mode. Displayed MRR is a calculated estimate (${fmt(metrics.mrr, 2)} mm3/min) based on Current (${fmt(parameters.current, 2)} A) and Voltage (${fmt(parameters.voltage, 2)} V), not a physical measurement.`;
  }

  if (dataMode === "live-unity") {
    stabilityText = metrics.arcRatio > 0.28
        ? `Arc ratio is ${fmt(metrics.arcRatio * 100, 1)}% — above the 28% threshold. Consider increasing flushing pressure or widening the gap.`
        : `Arc ratio is ${fmt(metrics.arcRatio * 100, 1)}% — within normal range. Gap stability is ${fmt(metrics.gapStability, 0)}%.`;
  } else if (dataMode === "dataset" && dataset.loaded) {
    stabilityText = `Dataset sample ${dataset.index + 1} of ${dataset.rows.length}. Surface roughness (Ra) is ${fmt(metrics.surfaceRoughness, 2)} µm${previous ? `; changed by ${fmt(metrics.surfaceRoughness - previous.surfaceRoughness, 2)} µm from previous sample` : ""}.`;
  } else {
    stabilityText = `Simulation: duty cycle ${fmt(metrics.dutyCycle, 1)}%, dielectric temperature ${fmt(metrics.dielectricTemperature, 1)} °C. These are calculated values, not measured.`;
  }

  const observations = [
    {
      label: "Operating Point",
      text: `Machine setpoints are: Current = ${fmt(parameters.current, 1)} A, Voltage = ${fmt(parameters.voltage, 1)} V, TON = ${fmt(parameters.pulseOn, 0)} µs.`,
      source: "Dashboard input"
    },
    {
      label: "Material Removal Rate",
      text: mrrText,
      source: dataMode === "dataset" ? "Dataset row (measured)" : dataMode === "live-unity" ? "Measured (ESP32)" : "Simulation (calculated)"
    },
    {
      label: "Process Stability",
      text: stabilityText,
      source: dataMode === "dataset" ? "Dataset row (measured)" : dataMode === "live-unity" ? "Rule-based on telemetry" : "Simulation (calculated)"
    }
  ];

  return (
    <Panel title="System Diagnostics" eyebrow="Condition monitoring & telemetry" accent="violet">
      <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
        <div className="space-y-3">
          {observations.map((obs) => (
            <div key={obs.label} className="rounded border border-plant-line bg-plant-deck p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-plant-cyan">
                  <Bot size={16} />
                  {obs.label}
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-plant-muted bg-plant-void px-2 py-0.5 rounded border border-plant-line">
                  Source: {obs.source}
                </div>
              </div>
              <p className="text-sm leading-6 text-plant-text">{obs.text}</p>
            </div>
          ))}
        </div>
        <div className="rounded border border-plant-line bg-plant-deck p-4">
          <div className="text-sm font-semibold uppercase text-plant-text">System Status</div>
          <div className="mt-4 space-y-2 text-sm">
            <VisionRow label="Telemetry" value={dataMode === "live-unity" ? "Connected" : "Not connected"} tone={dataMode === "live-unity" ? "green" : "amber"} />
            <VisionRow label="MRR Basis" value={dataMode === "live-unity" ? "Measured" : dataMode === "dataset" ? "Historical data" : "Simulation model"} tone={dataMode === "live-unity" || dataMode === "dataset" ? "green" : "cyan"} />
            <VisionRow label="AI Diagnostic" value="Rule-based expert system" tone="violet" />
            <VisionRow label="Failure prediction" value="Not supported" tone="amber" />
          </div>
        </div>
      </div>
    </Panel>
  );
}
function VisionRow({ label, value, tone }: { label: string; value: string; tone: "cyan" | "amber" | "green" | "red" | "violet" }) {
  return (
    <div className="flex items-center justify-between border-b border-plant-line pb-2">
      <span className="text-plant-muted">{label}</span>
      <StatusPill label={value} tone={tone} />
    </div>
  );
}

function Maintenance() {
  const dataMode = useTwinStore((state) => state.dataMode);
  const metrics = useTwinStore((state) => state.metrics);
  const isLive = dataMode === "live-unity";

  // Each card specifies its real data source and what can/cannot be supported
  const items: Array<{
    label: string;
    status: string;
    badge: string;
    tone: "green" | "amber" | "red";
    note: string;
  }> = [
    {
      label: "Pump Health",
      status: "No flow/pressure telemetry",
      badge: "No data",
      tone: "amber",
      note: "Requires a flow or differential-pressure sensor connected to ESP32.",
    },
    {
      label: "Filter Health",
      status: "No differential-pressure telemetry",
      badge: "No data",
      tone: "amber",
      note: "Requires delta-P measurement across dielectric filter. Not currently available.",
    },
    {
      label: "Servo / Toolhead",
      status: isLive ? "ESP32 serial connected" : "Not connected",
      badge: isLive ? "Connected" : "Simulation only",
      tone: isLive ? "green" : "amber",
      note: isLive
        ? "Servo position and motion reported from ESP32 in real time."
        : "No live servo telemetry. Dashboard uses simulated position.",
    },
    {
      label: "Power Supply",
      status: "No cabinet temperature sensor",
      badge: "No data",
      tone: "amber",
      note: "Requires cabinet thermistor or power-supply current sense. Not currently wired.",
    },
    {
      label: "Electrode Life",
      status: isLive
        ? `Tool wear rate: ${fmt(metrics.toolWearRate, 3)} %/min (simulation-derived)`
        : "Simulation only",
      badge: isLive ? "Partial" : "Simulation only",
      tone: "amber",
      note: "Electrode mass is not measured directly. Wear rate is estimated from the physics simulation, not from a load cell or mass scale.",
    },
    {
      label: "Sensor Network",
      status: isLive ? "Alarm thresholds active" : "Rule-based limits only",
      badge: isLive ? "Active" : "Simulation",
      tone: isLive ? "green" : "amber",
      note: isLive
        ? "Alarm thresholds are applied to live ESP32 sensor readings."
        : "Limits are applied to simulated values. No physical sensors are connected.",
    },
  ];

  return (
    <Panel title="Predictive Maintenance" eyebrow="Condition monitoring — honest telemetry status" accent="green">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <div key={item.label} className="rounded border border-plant-line bg-plant-deck p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-plant-text">{item.label}</div>
              <span
                className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  item.tone === "green"
                    ? "bg-plant-green/15 text-plant-green"
                    : item.tone === "red"
                    ? "bg-plant-red/15 text-plant-red"
                    : "bg-plant-amber/15 text-plant-amber"
                }`}
              >
                {item.badge}
              </span>
            </div>
            <div className="mt-2 text-xs leading-5 text-plant-muted">{item.note}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function EngineeringWorkspace() {
  const metrics = useTwinStore((state) => state.metrics);
  const equations = [
    ["Spark Energy", "E = 0.5 x Vgap x Ipeak x Ton", `${fmt(metrics.sparkEnergy, 4)} J`],
    ["MRR", "k x I^0.75 x Ton^0.4 x flushing x gap", `${fmt(metrics.mrr, 2)} mm3/min`],
    ["Ra", "0.023 x Epulse^0.38 x material factor", `${fmt(metrics.surfaceRoughness, 2)} um`],
    ["Thermal Z", "11.7 um/m/degC x L x deltaT", `${fmt((metrics.dielectricTemperature - 22) * 11.7, 1)} um`],
  ];
  return (
    <Panel title="Engineering Workspace" eyebrow="Physics model and validation" accent="cyan">
      <div className="grid gap-3 lg:grid-cols-2">
        {equations.map(([label, equation, value]) => (
          <div key={label} className="rounded border border-plant-line bg-plant-deck p-4">
            <div className="text-sm font-semibold text-plant-text">{label}</div>
            <div className="mt-2 font-mono text-xs text-plant-muted">{equation}</div>
            <div className="mt-3 font-mono text-xl text-plant-cyan">{value}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function csvEscape(value: unknown) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? "\"" + text.replace(/"/g, "\"\"") + "\"" : text;
}

function AnalyticsReports() {
  const history = useTwinStore((state) => state.history);
  const parameters = useTwinStore((state) => state.parameters);
  const metrics = useTwinStore((state) => state.metrics);
  const dataMode = useTwinStore((state) => state.dataMode);
  const dataset = useTwinStore((state) => state.dataset);

  const sourceLabel = dataMode === "dataset" ? "Dataset" : dataMode === "live-unity" ? "Live Unity" : "Simulation";
  const optimizationExport = dataset.loaded
    ? optimizationObjectives.map((objectiveItem) => {
        const result = analyzeDatasetOptimization(dataset.rows, objectiveItem.id);
        return {
          objective: objectiveItem.label,
          message: result.message,
          validSampleCount: result.validSampleCount,
          excludedSampleCount: result.excludedSampleCount,
          bestCondition: result.bestCondition
            ? {
                sample: result.bestCondition.sample.t !== "" && result.bestCondition.sample.t != null ? result.bestCondition.sample.t : result.bestCondition.rowIndex + 1,
                rowIndex: result.bestCondition.rowIndex,
                score: result.bestCondition.score,
                parameters: result.bestCondition.sample.parameters,
                metrics: result.bestCondition.sample.metrics,
              }
            : null,
          topFive: result.rankedSamples.slice(0, 5).map((condition) => ({
            sample: condition.sample.t !== "" && condition.sample.t != null ? condition.sample.t : condition.rowIndex + 1,
            rowIndex: condition.rowIndex,
            score: condition.score,
            parameters: condition.sample.parameters,
            metrics: condition.sample.metrics,
          })),
        };
      })
    : [];
  const download = (kind: "json" | "csv") => {
    const exportRows = history.map((p) => ({
      timestamp: p.t,
      current: p.current,
      voltage: p.voltage,
      gapVoltage: p.gapVoltage,
      pulseOn: p.pulseOn,
      pulseOff: p.pulseOff,
      dutyCycle: p.dutyCycle,
      gapDistance: p.gapDistance,
      dielectricPressure: p.pressure,
      dielectricFlow: p.flowRate,
      temperature: p.dielectricTemperature,
      MRR: p.mrr,
      TWR: p.toolWearRate,
      surfaceRoughness: p.surfaceRoughness,
      machineHealth: p.machineHealth,
      gapStability: p.gapStability,
      depthOfCut: parameters.depthOfCut,
    }));
    const payload =
      kind === "json"
        ? JSON.stringify({ generatedAt: new Date().toISOString(), dataSource: sourceLabel, originalDataset: dataset.fileName, parameters, metrics, history: exportRows, optimization: optimizationExport }, null, 2)
        : [
            "dataSource,originalDataset,timestamp,current,voltage,gapVoltage,pulseOn,pulseOff,dutyCycle,gapDistance,dielectricPressure,dielectricFlow,temperature,MRR,TWR,surfaceRoughness,machineHealth,gapStability,depthOfCut",
            ...exportRows.map((row) =>
              [sourceLabel, dataset.fileName ?? "", row.timestamp, row.current, row.voltage, row.gapVoltage, row.pulseOn, row.pulseOff, row.dutyCycle, row.gapDistance, row.dielectricPressure, row.dielectricFlow, row.temperature, row.MRR, row.TWR, row.surfaceRoughness, row.machineHealth, row.gapStability, row.depthOfCut].map(csvEscape).join(","),
            ),
          ].join("\n");
    const blob = new Blob([payload], { type: kind === "json" ? "application/json" : "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `edm-digital-twin-report.${kind}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Panel title="Reports and Analytics" eyebrow="Traceability exports" accent="amber">
      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={history} margin={{ left: -20, right: 12, top: 8, bottom: 0 }}>
            <CartesianGrid stroke="#273244" strokeDasharray="3 3" />
            <XAxis dataKey="t" tick={{ fill: "#8291a5", fontSize: 10 }} />
            <YAxis tick={{ fill: "#8291a5", fontSize: 10 }} />
            <Tooltip contentStyle={{ background: "#101722", border: "1px solid #273244", color: "#d9e3ee" }} />
            <Line type="monotone" dataKey="mrr" stroke="#51d88a" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="surfaceRoughness" stroke="#28d7ff" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="toolWearRate" stroke="#f4b24d" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
        <div className="space-y-3">
          <button className="flex w-full items-center justify-center gap-2 rounded bg-plant-cyan px-4 py-3 text-sm font-semibold uppercase text-plant-void" onClick={() => download("json")} type="button">
            <Download size={16} />
            Export JSON
          </button>
          <button className="flex w-full items-center justify-center gap-2 rounded border border-plant-line px-4 py-3 text-sm font-semibold uppercase text-plant-text" onClick={() => download("csv")} type="button">
            <Download size={16} />
            Export CSV
          </button>
          <div className="rounded border border-plant-line bg-plant-deck p-4 text-sm leading-6 text-plant-muted">
            Export follows the active source: {sourceLabel}{dataset.fileName ? ` / ${dataset.fileName}` : ""}. Dataset exports preserve imported MRR and TWR values.
          </div>
        </div>
      </div>
    </Panel>
  );
}
function AlarmCenter() {
  const alarms = useTwinStore((state) => state.alarms);
  const alarmHistory = useTwinStore((state) => state.alarmHistory);
  return (
    <Panel title="Alarm Center" eyebrow="Thresholds from implementation guide" accent={alarms.length ? "red" : "green"}>
      <div className="space-y-2">
        {alarms.length === 0 ? (
          <div className="flex items-center gap-3 rounded border border-plant-green/50 bg-plant-green/10 p-4 text-plant-green">
            <CheckCircle2 size={18} />
            All alarm thresholds are nominal.
          </div>
        ) : (
          alarms.map((alarm) => (
            <div key={alarm.id} className="flex items-start gap-3 rounded border border-plant-line bg-plant-deck p-4">
              <AlertTriangle className={alarm.level === "CRITICAL" ? "text-plant-red" : "text-plant-amber"} size={18} />
              <div>
                <div className="font-semibold text-plant-text">
                  {alarm.level} / {alarm.source}
                </div>
                <div className="mt-1 text-sm text-plant-muted">{alarm.message}</div>
              </div>
            </div>
          ))
        )}
        {alarmHistory.slice(0, 8).map((alarm, index) => (
          <div key={`${alarm.id}-${alarm.timestamp ?? index}`} className="flex items-start gap-3 rounded border border-plant-line bg-plant-void p-3">
            <AlertTriangle className={alarm.level === "CRITICAL" ? "text-plant-red" : "text-plant-amber"} size={16} />
            <div>
              <div className="text-xs font-semibold uppercase text-plant-muted">
                History / {alarm.level} / {alarm.timestamp ? new Date(alarm.timestamp).toLocaleTimeString() : "recorded"}
              </div>
              <div className="mt-1 text-sm text-plant-text">{alarm.message}</div>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ResearchMode() {
  const parameters = useTwinStore((state) => state.parameters);
  const elapsedSeconds = useTwinStore((state) => state.elapsedSeconds);
  const rows = [-4, -2, 0, 2, 4].map((delta) => {
    const candidate = { ...parameters, current: Math.max(2, parameters.current + delta) };
    const metrics = compareWhatIf(parameters, candidate, elapsedSeconds).predicted;
    return { current: candidate.current, mrr: metrics.mrr, ra: metrics.surfaceRoughness, wear: metrics.electrodeWearRatio, confidence: metrics.predictionConfidence };
  });
  return (
    <Panel title="Research Mode" eyebrow="Batch simulation sweep" accent="violet">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead className="bg-plant-deck text-left text-xs uppercase tracking-wide text-plant-muted">
            <tr>
              {["Current A", "MRR mm3/min", "Ra um", "EWR %", "Confidence %"].map((head) => (
                <th key={head} className="border border-plant-line p-3">{head}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.current} className="text-plant-text">
                <td className="border border-plant-line p-3 font-mono">{fmt(row.current, 1)}</td>
                <td className="border border-plant-line p-3 font-mono text-plant-green">{fmt(row.mrr, 2)}</td>
                <td className="border border-plant-line p-3 font-mono text-plant-cyan">{fmt(row.ra, 2)}</td>
                <td className="border border-plant-line p-3 font-mono text-plant-amber">{fmt(row.wear, 2)}</td>
                <td className="border border-plant-line p-3 font-mono text-plant-violet">{fmt(row.confidence, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function DeveloperDiagnostics() {
  const [visible, setVisible] = useState(false);
  const diagnostics = useTwinStore((state) => state.diagnostics);
  const connectionStatus = useTwinStore((state) => state.connectionStatus);
  const dataMode = useTwinStore((state) => state.dataMode);
  const machineState = useTwinStore((state) => state.machineState);

  return (
    <Panel
      title="Developer Diagnostics"
      eyebrow="Hidden integration console"
      accent="violet"
      action={
        <button className="rounded border border-plant-line px-3 py-1.5 text-xs text-plant-muted hover:text-plant-text" onClick={() => setVisible(!visible)} type="button">
          {visible ? "Hide" : "Show"} Developer Mode
        </button>
      }
    >
      {visible ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <MetricCard label="Gateway" value={connectionStatus === "connected" ? "1" : "0"} unit="" tone={connectionStatus === "connected" ? "green" : "red"} sublabel={connectionStatus} />
            <MetricCard label="Mode" value={dataMode === "dataset" ? "Data" : dataMode === "live-unity" ? "Live" : "Sim"} unit="" tone={dataMode === "live-unity" ? "cyan" : dataMode === "dataset" ? "green" : "amber"} sublabel="React source" />
            <MetricCard label="Unity" value={machineState === "OFFLINE" ? "0" : "1"} unit="" tone={machineState === "OFFLINE" ? "red" : "green"} sublabel={machineState} />
            <MetricCard label="Ping" value={`${diagnostics.latencyMs ?? 0}`} unit="ms" tone={diagnostics.latencyMs == null ? "amber" : "green"} sublabel="Gateway ack latency" />
            <MetricCard label="Packets Sent" value={`${diagnostics.packetsSent}`} unit="" tone="cyan" sublabel="React outbound" />
            <MetricCard label="Packets Received" value={`${diagnostics.packetsReceived}`} unit="" tone="green" sublabel="Gateway inbound" />
            <MetricCard label="Reconnects" value={`${diagnostics.reconnectCount}`} unit="" tone={diagnostics.reconnectCount > 0 ? "amber" : "green"} sublabel="Socket recovery" />
            <MetricCard label="Machine Link" value={connectionStatus === "connected" && machineState !== "OFFLINE" ? "OK" : "WAIT"} unit="" tone={connectionStatus === "connected" ? "green" : "amber"} sublabel="React-Gateway-Unity" />
            <MetricCard label="Quality" value={diagnostics.latencyMs == null ? "WAIT" : diagnostics.latencyMs < 120 ? "GOOD" : "SLOW"} unit="" tone={diagnostics.latencyMs == null ? "amber" : diagnostics.latencyMs < 120 ? "green" : "red"} sublabel="Connection quality" />
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="rounded bg-plant-cyan px-3 py-2 text-xs font-semibold uppercase text-plant-void" onClick={pingGateway} type="button">Ping</button>
            <button className="rounded border border-plant-line px-3 py-2 text-xs font-semibold uppercase text-plant-text" onClick={requestLiveStatus} type="button">Request Status</button>
            <button className="rounded border border-plant-green px-3 py-2 text-xs font-semibold uppercase text-plant-green" onClick={startLiveMachining} type="button">Test Start</button>
            <button className="rounded border border-plant-amber px-3 py-2 text-xs font-semibold uppercase text-plant-amber" onClick={stopLiveMachining} type="button">Test Stop</button>
          </div>
          <div className="max-h-72 overflow-auto rounded border border-plant-line bg-plant-void">
            {diagnostics.lastMessages.map((entry) => (
              <div key={`${entry.timestamp}-${entry.direction}-${entry.type}`} className="grid gap-2 border-b border-plant-line px-3 py-2 font-mono text-[11px] text-plant-muted md:grid-cols-[170px_70px_190px_1fr]">
                <span>{entry.timestamp}</span>
                <span className={entry.direction === "out" ? "text-plant-cyan" : entry.direction === "in" ? "text-plant-green" : "text-plant-amber"}>{entry.direction}</span>
                <span className="text-plant-text">{entry.type}</span>
                <span className="truncate">{entry.summary}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-sm text-plant-muted">Developer Mode is hidden. Enable it only while testing gateway, Unity, and packet flow.</div>
      )}
    </Panel>
  );
}

function EventLogPanel() {
  const eventLog = useTwinStore((state) => state.eventLog);

  return (
    <Panel title="Industrial Event Log" eyebrow="Commands, parameters, connections, alarms" accent="amber">
      <div className="max-h-80 overflow-auto rounded border border-plant-line bg-plant-void">
        {eventLog.length === 0 ? (
          <div className="p-4 text-sm text-plant-muted">No events recorded yet.</div>
        ) : (
          eventLog.slice(0, 24).map((entry) => (
            <div key={entry.id} className="grid gap-2 border-b border-plant-line px-3 py-2 font-mono text-[11px] text-plant-muted md:grid-cols-[170px_95px_110px_1fr]">
              <span>{new Date(entry.timestamp).toLocaleString()}</span>
              <span className={entry.level === "EMERGENCY" || entry.level === "CRITICAL" ? "text-plant-red" : entry.level === "WARNING" ? "text-plant-amber" : "text-plant-green"}>{entry.level}</span>
              <span className="text-plant-cyan">{entry.category}</span>
              <span className="text-plant-text">{entry.message}</span>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

function NotificationToast({
  notification,
  onDismiss,
}: {
  notification: DashboardNotification;
  onDismiss: (id: string) => void;
}) {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // Only auto-dismiss operational confirmations (INFO level) after 2.5 seconds (2500 ms)
    // Critical errors, safety warnings, and emergency-stop conditions remain persistent
    const isAutoDismiss = notification.level === "INFO";
    if (!isAutoDismiss) return;

    const timer = setTimeout(() => {
      setIsExiting(true);
      const exitTimer = setTimeout(() => {
        onDismiss(notification.id);
      }, 250);
      return () => clearTimeout(exitTimer);
    }, 2500);

    return () => clearTimeout(timer);
  }, [notification.id, notification.level, onDismiss]);

  const handleManualDismiss = () => {
    setIsExiting(true);
    setTimeout(() => {
      onDismiss(notification.id);
    }, 150);
  };

  const isCritical = notification.level === "EMERGENCY" || notification.level === "CRITICAL";
  const isWarning = notification.level === "WARNING";

  return (
    <div
      className={`pointer-events-auto flex items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 shadow-lg backdrop-blur-md transition-all duration-250 ease-out ${
        isExiting ? "opacity-0 translate-x-4 scale-95" : "opacity-100 translate-x-0 scale-100"
      } ${
        isCritical
          ? "border-plant-red bg-plant-red/25 text-plant-red shadow-[0_0_15px_rgba(239,68,68,0.25)]"
          : isWarning
            ? "border-plant-amber bg-plant-amber/25 text-plant-amber shadow-[0_0_15px_rgba(245,158,11,0.25)]"
            : "border-plant-cyan/60 bg-plant-panel/95 text-plant-cyan shadow-[0_0_15px_rgba(6,182,212,0.15)]"
      }`}
      role="alert"
    >
      <div className="flex items-center gap-2 overflow-hidden">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            isCritical ? "bg-plant-red animate-pulse" : isWarning ? "bg-plant-amber" : "bg-plant-cyan"
          }`}
        />
        <div className="truncate text-xs font-semibold uppercase tracking-wider">{notification.message}</div>
      </div>
      <button
        className="shrink-0 rounded p-1 text-plant-muted transition-colors hover:bg-white/10 hover:text-plant-text focus:outline-none"
        onClick={handleManualDismiss}
        type="button"
        aria-label="Dismiss notification"
      >
        <X size={14} />
      </button>
    </div>
  );
}

function NotificationStack() {
  const notifications = useTwinStore((state) => state.notifications);
  const dismissNotification = useTwinStore((state) => state.dismissNotification);

  if (notifications.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed top-16 right-3 sm:top-20 sm:right-5 z-50 flex w-[min(340px,calc(100vw-1.5rem))] flex-col gap-2"
      aria-live="polite"
    >
      {notifications.map((notification) => (
        <NotificationToast
          key={notification.id}
          notification={notification}
          onDismiss={dismissNotification}
        />
      ))}
    </div>
  );
}

function Dashboard({ active }: { active: string }) {
  const permissions = useAuthStore((state) => state.permissions);
  const role = useAuthStore((state) => state.role);

  // Strict route authorization guards
  if (active === "machine-control" && !permissions.canControlPhysicalMachine) {
    return (
      <main className="p-4">
        <Panel title="Access Restricted" eyebrow="Role Authorization Required" accent="red">
          <div className="p-6 text-xs text-plant-red space-y-3">
            <div className="text-sm font-bold uppercase tracking-wider">Physical Machine Control Restricted</div>
            <p className="text-plant-muted text-xs leading-relaxed max-w-xl">
              Real-time physical hardware execution and PLC parameter writeback on the ELEKTRA PULS S-50 ZNC
              are restricted to authorized institutional Administrator and HOD personnel.
            </p>
            <div className="pt-2">
              <Link to="/" className="inline-flex items-center gap-2 rounded bg-plant-cyan px-4 py-2 text-xs font-semibold uppercase text-plant-void hover:bg-plant-cyan/90 transition">
                Return to Overview
              </Link>
            </div>
          </div>
        </Panel>
      </main>
    );
  }

  if (active === "settings" && !permissions.canAccessSettings) {
    return (
      <main className="p-4">
        <Panel title="Access Restricted" eyebrow="Role Authorization Required" accent="red">
          <div className="p-6 text-xs text-plant-red space-y-3">
            <div className="text-sm font-bold uppercase tracking-wider">Platform Diagnostics Restricted</div>
            <p className="text-plant-muted text-xs leading-relaxed max-w-xl">
              Internal MQTT gateway telemetry, DAQ diagnostics, and platform secrets require verified Administrator or HOD authorization.
            </p>
            <div className="pt-2">
              <Link to="/" className="inline-flex items-center gap-2 rounded bg-plant-cyan px-4 py-2 text-xs font-semibold uppercase text-plant-void hover:bg-plant-cyan/90 transition">
                Return to Overview
              </Link>
            </div>
          </div>
        </Panel>
      </main>
    );
  }

  const [adminPanelTab, setAdminPanelTab] = useState<"controls" | "info">("controls");

  const overview = active === "dashboard";
  const showTwin = overview || active === "digital-twin" || active === "machine-control";
  const showToolheadTwin = overview || active === "digital-twin" || active === "toolhead" || (active === "machine-control" && permissions.canControlPhysicalMachine);
  const showMachineControl = (overview || active === "digital-twin" || active === "machine-control") && permissions.canControlPhysicalMachine;
  const showAnalysis = (overview || active === "analytics") && permissions.canExportReports;
  const showMl = overview || active === "predictions";
  const analysisWorkspace = active === "analytics" && permissions.canExportReports;

  return (
    <main className="space-y-4 p-4">
      {overview ? <LiveMetrics /> : null}

      {showTwin ? (
        <section aria-label="Digital Twin and machine control" className="space-y-4">
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,340px)]">
            <MachineView />
            {permissions.canControlPhysicalMachine ? (
              <div className="space-y-2">
                <div className="flex rounded border border-plant-line bg-plant-void p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setAdminPanelTab("controls")}
                    className={`flex-1 rounded py-1 font-bold uppercase tracking-wider transition ${
                      adminPanelTab === "controls"
                        ? "bg-plant-cyan text-plant-void shadow"
                        : "text-plant-muted hover:text-plant-text"
                    }`}
                  >
                    Live Controls
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminPanelTab("info")}
                    className={`flex-1 rounded py-1 font-bold uppercase tracking-wider transition ${
                      adminPanelTab === "info"
                        ? "bg-plant-cyan text-plant-void shadow"
                        : "text-plant-muted hover:text-plant-text"
                    }`}
                  >
                    Machine Info
                  </button>
                </div>
                {adminPanelTab === "controls" ? <LiveCommandPanel /> : <EdmMachineInfoPanel />}
              </div>
            ) : (
              <EdmMachineInfoPanel />
            )}
          </div>
          {showMachineControl ? <MachineControl /> : null}
          {showMachineControl ? <DatasetPanel /> : null}
        </section>
      ) : null}

      {showToolheadTwin ? (
        <section aria-label="Toolhead Digital Twin" className="border-t border-plant-line pt-5">
          <ToolheadDigitalTwin />
        </section>
      ) : null}

      {showAnalysis ? (
        <section aria-label="Analysis and graphs" className="space-y-3">
          <div className="border-b border-plant-line pb-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-plant-muted">Analysis</div>
            <h2 className="mt-1 text-base font-semibold uppercase text-plant-text">Process Graphs</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <TrendChart dataKey="voltage" color="#28d7ff" title="Voltage Trend" unit="V" />
            <TrendChart dataKey="current" color="#f4b24d" title="Current Trend" unit="A" />
            <TrendChart dataKey="pulseOn" color="#3ddc97" title="Pulse ON Trend" unit="us" />
            <TrendChart dataKey="toolWearRate" color="#ff6f91" title="Tool Wear Rate (TWR)" unit="%/min" />
            <TrendChart dataKey="dutyCycle" color="#b587ff" title="Duty Cycle Trend" unit="%" />
            <TrendChart dataKey="mrr" color="#61e3ff" title="Material Removal Rate (MRR)" unit="mm3/min" />
          </div>
          <AnalyticsReports />
        </section>
      ) : null}

      {showMl ? (role === "guest" ? <GuestDemoShowcase /> : <OptimizationEngine />) : null}

      {active === "digital-twin" ? <SensorFusion /> : null}
      {active === "digital-twin" ? <EngineeringWorkspace /> : null}
      {analysisWorkspace ? <AICopilot /> : null}
      {analysisWorkspace ? <Maintenance /> : null}
      {analysisWorkspace ? <AlarmCenter /> : null}
      {analysisWorkspace ? <ResearchMode /> : null}
      {active === "settings" && permissions.canAccessSettings ? (
        <>
          <Panel title="Platform Settings" eyebrow="Role and integration status" accent="cyan">
            <div className="grid gap-3 md:grid-cols-3">
              <MetricCard label="MQTT Latency" value="184" unit="ms" tone="green" sublabel="Target below 500 ms" />
              <MetricCard label="DAQ Loss" value="0.03" unit="%" tone="green" sublabel="Target below 0.1%" />
              <MetricCard label="TLS Status" value="1.3" unit="" tone="cyan" sublabel="Encrypted plant network" />
            </div>
          </Panel>
          <DeveloperDiagnostics />
          <EventLogPanel />
        </>
      ) : null}
    </main>
  );
}

export default function App() {
  const { user, status } = useAuthStore();
  const location = useLocation();
  const active = currentModule(location.pathname);
  const tick = useTwinStore((state) => state.tick);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (user) {
      initializeLiveUnityService();
      initializeToolheadService();
    }
  }, [user]);

  useInterval(() => {
    if (user) tick();
  }, 1000);

  // Unauthenticated users see the Login Landing Page
  if (!user || status === "unauthenticated") {
    return <LoginLandingPage />;
  }

  return (
    <div className="min-h-screen bg-plant-void text-plant-text overflow-x-hidden">
      <NotificationStack />
      {mobileMenuOpen ? <MobileNavDrawer active={active} onClose={() => setMobileMenuOpen(false)} /> : null}
      <div className="min-h-screen">
        <div className="min-w-0">
          <ShellHeader menuOpen={mobileMenuOpen} onToggleMenu={() => setMobileMenuOpen((open) => !open)} />
          <Sidebar active={active} />
          <Dashboard active={active} />
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-plant-line px-4 py-3 text-[11px] uppercase tracking-wide text-plant-muted">
            <span>EDM Digital Twin Platform / React 19 / Physics-informed simulation</span>
            <span className="inline-flex items-center gap-2">
              <ShieldCheck size={14} />
              Physical machine writeback disabled
            </span>
          </footer>
        </div>
      </div>
    </div>
  );
}
