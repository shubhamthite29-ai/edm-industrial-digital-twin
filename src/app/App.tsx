import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  Boxes,
  BrainCircuit,
  CheckCircle2,
  Cpu,
  Database,
  Download,
  FileText,
  Gauge,
  Microscope,
  Pause,
  Play,
  RadioTower,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Wrench,
  X,
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
import { MachineScene } from "../components/MachineScene";
import { MetricCard } from "../components/MetricCard";
import { Panel } from "../components/Panel";
import { ParameterStepper } from "../components/ParameterStepper";
import { SensorDiagram } from "../components/SensorDiagram";
import { StatusPill } from "../components/StatusPill";
import { sensors, sensorGroups } from "../data/sensors";
import { useInterval } from "../hooks/useInterval";
import { compareWhatIf } from "../services/edmCalculations";
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
import { machineParameterService } from "../Machine/MachineParameterService";
import { useTwinStore } from "../store/useTwinStore";
import type { CameraView, ConnectionStatus, DataMode, MachineMode, MachineParameters, UserRole } from "../types/twin";

const modules = [
  { key: "dashboard", label: "Dashboard", icon: Gauge },
  { key: "live-machine", label: "Live Machine", icon: RadioTower },
  { key: "digital-twin", label: "Digital Twin", icon: Boxes },
  { key: "machine-control", label: "Machine Control", icon: SlidersHorizontal },
  { key: "simulation", label: "Simulation", icon: Activity },
  { key: "ai-copilot", label: "AI Copilot", icon: Bot },
  { key: "engineering", label: "Engineering", icon: Cpu },
  { key: "predictions", label: "Predictions", icon: BrainCircuit },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
  { key: "maintenance", label: "Maintenance", icon: Wrench },
  { key: "alarm-center", label: "Alarm Center", icon: AlertTriangle },
  { key: "reports", label: "Reports", icon: FileText },
  { key: "settings", label: "Settings", icon: Settings },
  { key: "research-mode", label: "Research Mode", icon: Microscope },
];

const roles: UserRole[] = ["Operator", "Production Engineer", "Maintenance Engineer", "Research Mode", "Administrator"];
const machineModes: MachineMode[] = ["Die Sinking", "Wire Cut", "EDM Drilling"];
const electrodeMaterials: MachineParameters["electrodeMaterial"][] = ["Copper", "Graphite", "Brass Wire", "Tungsten Copper"];
const workpieceMaterials: MachineParameters["workpieceMaterial"][] = ["H13 Steel", "Titanium Ti-6Al-4V", "Inconel 718", "Tool Steel D2"];

function fmt(value: number, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : "--";
}

function currentModule(pathname: string) {
  const key = pathname.replace("/", "") || "dashboard";
  return modules.some((item) => item.key === key) ? key : "dashboard";
}

function connectionTone(status: ConnectionStatus) {
  if (status === "connected") return "green";
  if (status === "connecting") return "amber";
  return "red";
}

function connectionLabel(status: ConnectionStatus) {
  if (status === "connected") return "Connected";
  if (status === "connecting") return "Connecting...";
  return "Disconnected";
}

function ShellHeader() {
  const running = useTwinStore((state) => state.running);
  const setRunning = useTwinStore((state) => state.setRunning);
  const dataMode = useTwinStore((state) => state.dataMode);
  const setDataMode = useTwinStore((state) => state.setDataMode);
  const connectionStatus = useTwinStore((state) => state.connectionStatus);
  const machineStatus = useTwinStore((state) => state.machineStatus);
  const role = useTwinStore((state) => state.role);
  const setRole = useTwinStore((state) => state.setRole);
  const metrics = useTwinStore((state) => state.metrics);
  const alarms = useTwinStore((state) => state.alarms);
  const liveModeDisconnected = dataMode === "live-unity" && connectionStatus !== "connected";

  const handleRunToggle = () => {
    if (dataMode === "simulation") {
      setRunning(!running);
      return;
    }

    if (running) {
      stopLiveMachining();
    } else {
      startLiveMachining();
    }
  };

  return (
    <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-plant-line bg-plant-deck/95 px-5">
      <div>
        <div className="text-lg font-bold uppercase tracking-[0.24em] text-plant-cyan">EDM Industrial Digital Twin</div>
        <div className="text-[11px] uppercase tracking-[0.2em] text-plant-muted">
          Physics model + sensor fusion + AI decision support
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill label={machineStatus} tone={machineStatus === "Machining" ? "green" : "red"} />
        <StatusPill label={connectionLabel(connectionStatus)} tone={connectionTone(connectionStatus)} />
        <StatusPill label={`${fmt(metrics.twinAccuracy, 0)}% Twin Sync`} tone="cyan" />
        <StatusPill label={`${alarms.length} Alarms`} tone={alarms.some((alarm) => alarm.level === "CRITICAL") ? "red" : alarms.length ? "amber" : "green"} />
        <div className="inline-flex h-9 overflow-hidden rounded border border-plant-line bg-plant-void">
          {[
            ["simulation", "Simulation Mode"],
            ["live-unity", "Live Unity Mode"],
          ].map(([mode, label]) => (
            <button
              key={mode}
              className={`px-3 text-xs font-semibold uppercase tracking-wide transition ${
                dataMode === mode ? "bg-plant-cyan text-plant-void" : "text-plant-muted hover:text-plant-text"
              }`}
              onClick={() => setDataMode(mode as DataMode)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <select
          className="h-9 rounded border border-plant-line bg-plant-void px-2 text-xs text-plant-text outline-none"
          value={role}
          onChange={(event) => setRole(event.target.value as UserRole)}
          aria-label="User role"
        >
          {roles.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <button
          className={`inline-flex h-9 items-center gap-2 rounded px-3 text-xs font-semibold uppercase tracking-wide ${
            running ? "bg-plant-red text-white" : "bg-plant-green text-plant-void"
          }`}
          disabled={liveModeDisconnected}
          onClick={handleRunToggle}
          type="button"
        >
          {running ? <Pause size={15} /> : <Play size={15} />}
          {running ? "Halt" : "Start"}
        </button>
      </div>
    </header>
  );
}

function Sidebar({ active }: { active: string }) {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-plant-line bg-plant-deck lg:block">
      <div className="border-b border-plant-line px-4 py-4">
        <div className="text-[10px] uppercase tracking-[0.24em] text-plant-muted">Aerospace EDM Cell</div>
        <div className="mt-1 font-mono text-sm text-plant-text">CELL-EDM-04 / OPC-UA</div>
      </div>
      <nav className="space-y-1 p-3">
        {modules.map((item) => {
          const Icon = item.icon;
          const selected = item.key === active;
          return (
            <Link
              key={item.key}
              to={`/${item.key === "dashboard" ? "" : item.key}`}
              className={`flex h-10 items-center gap-3 rounded border px-3 text-sm transition ${
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
      </nav>
    </aside>
  );
}

function LiveMetrics() {
  const parameters = useTwinStore((state) => state.parameters);
  const metrics = useTwinStore((state) => state.metrics);
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
  const parameters = useTwinStore((state) => state.parameters);
  const metrics = useTwinStore((state) => state.metrics);
  return (
    <Panel title="3D EDM Digital Twin" eyebrow="Synchronized machine model" accent="violet">
      <MachineScene metrics={metrics} parameters={parameters} />
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <StatusPill label={`Spark ${metrics.gapState}`} tone={metrics.gapState === "Spark" ? "green" : metrics.gapState === "Arc" ? "red" : "amber"} />
        <StatusPill label={`${fmt(metrics.dielectricTemperature, 1)} degC dielectric`} tone={metrics.dielectricTemperature > 30 ? "amber" : "cyan"} />
        <StatusPill label={`${fmt(metrics.vibrationRms, 2)} g vibration`} tone={metrics.vibrationRms > 3 ? "red" : "green"} />
      </div>
    </Panel>
  );
}

function LiveCommandPanel() {
  const dataMode = useTwinStore((state) => state.dataMode);
  const connectionStatus = useTwinStore((state) => state.connectionStatus);
  const machineState = useTwinStore((state) => state.machineState);
  const telemetry = useTwinStore((state) => state.unityTelemetry);
  const disabled = dataMode !== "live-unity" || connectionStatus !== "connected";

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

  return (
    <Panel title="Live Unity Commands" eyebrow="Website controls Unity machine" accent="cyan">
      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-wrap gap-2">
          {commands.map(([label, command, tone]) => (
            <button
              key={label}
              className={`rounded border px-3 py-2 text-xs font-semibold uppercase tracking-wide transition ${
                tone === "red"
                  ? "border-plant-red bg-plant-red/15 text-plant-red"
                  : tone === "green"
                    ? "border-plant-green bg-plant-green/15 text-plant-green"
                    : tone === "amber"
                      ? "border-plant-amber bg-plant-amber/15 text-plant-amber"
                      : "border-plant-cyan bg-plant-cyan/15 text-plant-cyan"
              } disabled:cursor-not-allowed disabled:opacity-40`}
              disabled={disabled}
              onClick={() => command()}
              type="button"
            >
              {label}
            </button>
          ))}
          <div className="h-9 w-px bg-plant-line" />
          {cameraViews.map(([label, view]) => (
            <button
              key={view}
              className="rounded border border-plant-line px-3 py-2 text-xs font-semibold uppercase tracking-wide text-plant-muted transition hover:text-plant-text disabled:cursor-not-allowed disabled:opacity-40"
              disabled={disabled}
              onClick={() => setLiveCameraView(view)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
          <StatusPill label={`State ${machineState}`} tone={machineState === "MACHINING" ? "green" : machineState === "EMERGENCY_STOP" || machineState === "FAULT" ? "red" : "cyan"} />
          <StatusPill label={`Cycle ${fmt(telemetry.cyclePercent, 0)}%`} tone="amber" />
          <StatusPill label={`Tool ${fmt(telemetry.toolPosition, 2)}`} tone="violet" />
          <StatusPill label={`Spark ${telemetry.sparkActive ? "On" : "Off"}`} tone={telemetry.sparkActive ? "green" : "red"} />
        </div>
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
        <ParameterStepper id="voltage" label="Voltage" unit="V" min={40} max={160} step={1} decimals={0} />
        <ParameterStepper id="current" label="Current" unit="A" min={2} max={35} step={0.5} />
        <ParameterStepper id="gapVoltage" label="Gap Voltage" unit="V" min={20} max={140} step={1} decimals={0} />
        <ParameterStepper id="pulseOn" label="Pulse ON" unit="us" min={20} max={300} step={5} decimals={0} />
        <ParameterStepper id="pulseOff" label="Pulse OFF" unit="us" min={10} max={180} step={5} decimals={0} />
        <ParameterStepper id="gapDistance" label="Gap Distance" unit="mm" min={0.02} max={0.18} step={0.005} decimals={3} />
        <ParameterStepper id="servoFeed" label="Servo Feed" unit="mm/min" min={0.02} max={1.2} step={0.02} decimals={2} />
        <ParameterStepper id="toolDiameter" label="Tool Diameter" unit="mm" min={0.2} max={40} step={0.1} />
        <ParameterStepper id="pressure" label="Pressure" unit="bar" min={0.5} max={8} step={0.1} />
        <ParameterStepper id="flowRate" label="Flow" unit="L/min" min={1} max={20} step={0.2} />
        <ParameterStepper id="conductivity" label="Conductivity" unit="uS/cm" min={0.5} max={18} step={0.5} />
        <ParameterStepper id="openCircuitVoltage" label="Open Circuit Voltage" unit="V" min={70} max={140} step={1} decimals={0} />
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
  const recommendations = [
    metrics.surfaceRoughness > 2.8
      ? "Reduce pulse ON by 10-15 us and increase pulse OFF by 10 us to lower crater energy and improve Ra."
      : "Surface finish is inside the current qualified band; prioritize MRR or tool life depending on production target.",
    metrics.arcRatio > 0.28
      ? "Arc ratio is elevated. Increase flushing pressure by 0.3 bar or widen gap distance by 0.005 mm before raising current."
      : "Gap classifier sees stable spark behavior. Current parameter set is suitable for closed-loop optimization preview.",
    metrics.remainingToolLife < 35
      ? "Schedule electrode change before unattended machining. Wear ratio trend is close to the maintenance threshold."
      : "Electrode wear remains acceptable. Tool life model confidence is supported by B4 and pulse energy correlation.",
  ];

  return (
    <Panel title="EDM AI Copilot" eyebrow="Process engineer reasoning" accent="violet">
      <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
        <div className="space-y-3">
          {recommendations.map((item, index) => (
            <div key={item} className="rounded border border-plant-line bg-plant-deck p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-plant-cyan">
                <Bot size={16} />
                Recommendation {index + 1}
              </div>
              <p className="text-sm leading-6 text-plant-text">{item}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <StatusPill label={`${fmt(metrics.predictionConfidence, 0)}% confidence`} tone="cyan" />
                <StatusPill label={`${parameters.workpieceMaterial}`} tone="amber" />
                <StatusPill label={`${fmt(metrics.machineEfficiency, 0)}% efficiency`} tone="green" />
              </div>
            </div>
          ))}
        </div>
        <div className="rounded border border-plant-line bg-plant-deck p-4">
          <div className="text-sm font-semibold uppercase text-plant-text">Virtual Camera Panel</div>
          <div className="mt-4 aspect-video rounded border border-plant-line bg-[radial-gradient(circle_at_50%_52%,rgba(244,178,77,0.45),transparent_12%),radial-gradient(circle_at_52%_50%,rgba(40,215,255,0.28),transparent_21%),#070b12]" />
          <div className="mt-3 space-y-2 text-sm">
            <VisionRow label="Spark quality" value={metrics.arcRatio < 0.25 ? "Clean pulse train" : "Arc contamination"} tone={metrics.arcRatio < 0.25 ? "green" : "amber"} />
            <VisionRow label="Heat distribution" value={`${fmt(metrics.dielectricTemperature, 1)} degC fluid`} tone={metrics.dielectricTemperature > 30 ? "amber" : "cyan"} />
            <VisionRow label="Electrode wear" value={`${fmt(100 - metrics.remainingToolLife, 0)}% consumed`} tone={metrics.remainingToolLife < 30 ? "red" : "green"} />
            <VisionRow label="AI confidence" value={`${fmt(metrics.predictionConfidence, 0)}%`} tone="violet" />
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
  const metrics = useTwinStore((state) => state.metrics);
  const items = [
    ["Pump Health", 92 - Math.max(0, 8 - metrics.coolingRate) * 4],
    ["Filter Health", 84 - metrics.arcRatio * 18],
    ["Servo Health", metrics.gapStability * 0.92],
    ["Power Supply", 96 - Math.max(0, metrics.cabinetTemperature - 42) * 0.8],
    ["Electrode Life", metrics.remainingToolLife],
    ["Sensor Health", metrics.twinAccuracy],
  ] as const;
  return (
    <Panel title="Predictive Maintenance" eyebrow="Remaining useful life" accent="green">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map(([label, value]) => (
          <div key={label} className="rounded border border-plant-line bg-plant-deck p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-plant-text">{label}</div>
              <div className={`font-mono text-sm ${value < 35 ? "text-plant-red" : value < 70 ? "text-plant-amber" : "text-plant-green"}`}>{fmt(value, 0)}%</div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded bg-plant-void">
              <div className={`h-full ${value < 35 ? "bg-plant-red" : value < 70 ? "bg-plant-amber" : "bg-plant-green"}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
            </div>
            <div className="mt-3 text-xs text-plant-muted">Failure probability: {fmt(Math.max(2, 100 - value) * 0.28, 1)}%</div>
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

function AnalyticsReports() {
  const history = useTwinStore((state) => state.history);
  const parameters = useTwinStore((state) => state.parameters);
  const metrics = useTwinStore((state) => state.metrics);

  const download = (kind: "json" | "csv") => {
    const payload =
      kind === "json"
        ? JSON.stringify({ generatedAt: new Date().toISOString(), parameters, metrics, history }, null, 2)
        : ["t,voltage,current,power,mrr,ra,toolLife,health", ...history.map((p) => [p.t, p.voltage, p.current, p.power, p.mrr, p.surfaceRoughness, p.remainingToolLife, p.machineHealth].join(","))].join("\n");
    const blob = new Blob([payload], { type: kind === "json" ? "application/json" : "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `edm-digital-twin-report.${kind}`;
    anchor.click();
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
            Report package covers engineering state, machine health, maintenance indicators, simulation metrics, and AI optimization context.
          </div>
        </div>
      </div>
    </Panel>
  );
}

function AlarmCenter() {
  const alarms = useTwinStore((state) => state.alarms);
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
            <MetricCard label="Mode" value={dataMode === "live-unity" ? "Live" : "Sim"} unit="" tone={dataMode === "live-unity" ? "cyan" : "amber"} sublabel="React source" />
            <MetricCard label="Unity" value={machineState === "OFFLINE" ? "0" : "1"} unit="" tone={machineState === "OFFLINE" ? "red" : "green"} sublabel={machineState} />
            <MetricCard label="Ping" value={`${diagnostics.latencyMs ?? 0}`} unit="ms" tone={diagnostics.latencyMs == null ? "amber" : "green"} sublabel="Gateway ack latency" />
            <MetricCard label="Packets Sent" value={`${diagnostics.packetsSent}`} unit="" tone="cyan" sublabel="React outbound" />
            <MetricCard label="Packets Received" value={`${diagnostics.packetsReceived}`} unit="" tone="green" sublabel="Gateway inbound" />
            <MetricCard label="Reconnects" value={`${diagnostics.reconnectCount}`} unit="" tone={diagnostics.reconnectCount > 0 ? "amber" : "green"} sublabel="Socket recovery" />
            <MetricCard label="Machine Link" value={connectionStatus === "connected" && machineState !== "OFFLINE" ? "OK" : "WAIT"} unit="" tone={connectionStatus === "connected" ? "green" : "amber"} sublabel="React-Gateway-Unity" />
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

function Dashboard({ active }: { active: string }) {
  const metrics = useTwinStore((state) => state.metrics);
  const parameters = useTwinStore((state) => state.parameters);

  const showControl = ["dashboard", "machine-control", "simulation", "live-machine"].includes(active);
  const showSensors = ["dashboard", "digital-twin", "engineering", "settings"].includes(active);
  const showAI = ["dashboard", "ai-copilot", "predictions"].includes(active);
  const showMaintenance = ["dashboard", "maintenance", "predictions"].includes(active);
  const showReports = ["dashboard", "analytics", "reports"].includes(active);

  return (
    <main className="space-y-4 p-4">
      <LiveMetrics />
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)]">
        <MachineView />
        <div className="grid gap-4">
          <TrendChart dataKey="voltage" color="#28d7ff" title="Voltage Trend" unit="V" />
          <TrendChart dataKey="current" color="#f4b24d" title="Current Trend" unit="A" />
        </div>
      </div>
      {showControl ? <LiveCommandPanel /> : null}
      {showControl ? <MachineControl /> : null}
      {showSensors ? <SensorFusion /> : null}
      {showAI ? <AICopilot /> : null}
      {active === "engineering" || active === "digital-twin" || active === "dashboard" ? <EngineeringWorkspace /> : null}
      {showMaintenance ? <Maintenance /> : null}
      {active === "alarm-center" || active === "dashboard" ? <AlarmCenter /> : null}
      {active === "research-mode" ? <ResearchMode /> : null}
      {showReports ? <AnalyticsReports /> : null}
      {active === "settings" ? (
        <>
          <Panel title="Platform Settings" eyebrow="Role and integration status" accent="cyan">
            <div className="grid gap-3 md:grid-cols-3">
              <MetricCard label="MQTT Latency" value="184" unit="ms" tone="green" sublabel="Target below 500 ms" />
              <MetricCard label="DAQ Loss" value="0.03" unit="%" tone="green" sublabel="Target below 0.1%" />
              <MetricCard label="TLS Status" value="1.3" unit="" tone="cyan" sublabel="Encrypted plant network" />
            </div>
          </Panel>
          <DeveloperDiagnostics />
        </>
      ) : null}
      <div className="grid gap-3 md:grid-cols-4">
        <StatusPill label={`${parameters.machiningMode}`} tone="cyan" />
        <StatusPill label={`${parameters.electrodeMaterial} electrode`} tone="amber" />
        <StatusPill label={`${parameters.workpieceMaterial}`} tone="violet" />
        <StatusPill label={`${fmt(metrics.oee, 0)}% OEE`} tone="green" />
      </div>
    </main>
  );
}

export default function App() {
  const location = useLocation();
  const active = currentModule(location.pathname);
  const tick = useTwinStore((state) => state.tick);

  useEffect(() => {
    initializeLiveUnityService();
  }, []);

  useInterval(tick, 1000);

  return (
    <div className="min-h-screen bg-plant-void text-plant-text">
      <div className="flex min-h-screen">
        <Sidebar active={active} />
        <div className="min-w-0 flex-1">
          <ShellHeader />
          <div className="flex items-center gap-2 border-b border-plant-line bg-plant-panel px-4 py-2 text-xs uppercase tracking-wide text-plant-muted lg:hidden">
            <Database size={14} />
            EDM platform modules are available in the desktop sidebar.
          </div>
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
