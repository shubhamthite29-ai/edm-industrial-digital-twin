import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { ArrowDown, ArrowUp, Box, Cpu, Moon, Radio, Square, Sun, Usb } from "lucide-react";
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Box3, Group, MathUtils, Mesh, MeshStandardMaterial, PerspectiveCamera, Quaternion, Vector3, type Material } from "three";
import { Panel } from "./Panel";
import { armToolheadController, moveToolheadDown, moveToolheadUp, setToolheadMode, setToolheadPosition, setToolheadSpeed, stopToolhead } from "../services/toolheadService";
import { useToolheadStore } from "../store/useToolheadStore";
import { useAuthStore } from "../store/useAuthStore";
import { webSerialService, type WebSerialStatus } from "../services/webSerialService";

const componentRoot = `${import.meta.env.BASE_URL}models/toolhead/edm-toolhead.glb`;
const TOOLHEAD_THEME_KEY = "edm-toolhead-theme";
type ToolheadTheme = "dark" | "light";

type ToolheadPartKey = "base" | "lowerPlate" | "motorBracket" | "pusher" | "toolHead" | "upperPlate";
type AssetStatus = "checking" | "ready" | "failed";

interface ToolheadPartAsset {
  key: ToolheadPartKey;
  label: string;
  url: string;
  moving: boolean;
  position: [number, number, number];
  quaternion?: [number, number, number, number];
  color: string;
  roughness: number;
  metalness: number;
  emissive?: string;
}

// Exported CAD uses source X as the pusher's longitudinal direction. The
// assembly rotates that source axis to world-up without changing the GLBs.
const toolheadParts: ToolheadPartAsset[] = [
  { key: "base", label: "Base", url: `${componentRoot}/base_edm_machine_main.glb`, moving: false, position: [0, 0, 0], color: "#364250", roughness: 0.48, metalness: 0.7 },
  { key: "lowerPlate", label: "Down closer plate", url: `${componentRoot}/down_closer_plate_main.glb`, moving: false, position: [-0.024892985820770264, 0.03449004888534546, 0.060289978981018066], quaternion: [0, 0, 1, 0], color: "#647386", roughness: 0.38, metalness: 0.72 },
  { key: "motorBracket", label: "Motor bracket", url: `${componentRoot}/motor_bracket_top.glb`, moving: false, position: [0.00020760297775268555, -0.000796556755900383, -0.0004792213439941406], color: "#65717e", roughness: 0.42, metalness: 0.7 },
  { key: "upperPlate", label: "Upper closer plate", url: `${componentRoot}/upper_closer_plate_final_changed.glb`, moving: false, position: [-0.00037997961044311523, 0.004999995231628418, 0], color: "#7b8793", roughness: 0.36, metalness: 0.74 },
  { key: "pusher", label: "Pusher", url: `${componentRoot}/pusher_150mm.glb`, moving: true, position: [-0.0390239953994751, 0.004205822944641113, 0.006728053092956543], color: "#3d8f98", roughness: 0.3, metalness: 0.78, emissive: "#06272b" },
  { key: "toolHead", label: "Tool head / nozzle", url: `${componentRoot}/tool_head.glb`, moving: true, position: [0, 0, 0], color: "#c99b43", roughness: 0.3, metalness: 0.8, emissive: "#2d1a03" },
];

// Relative transforms come directly from Assem1.glb using its base node as
// datum. The Toolhead quaternion reproduces the CAD spindle orientation while
// the parent PusherGroup preserves its one-piece moving relationship.
const TOOLHEAD_MOUNT_POSITION: [number, number, number] = [-0.03855019807815552, 0.02607107162475586, 0.01694786611218071];
const TOOLHEAD_MOUNT_QUATERNION = new Quaternion(-0.4907929003238678, 0.5090406537055969, 0.4907929003238678, 0.5090405941009521);

// The reference assembly places the Toolhead lower tip at -0.06101 m at TOP.
// Its 100 mm canonical endpoint is clamped to retain a 10 mm browser-side
// clearance above the base's -0.12651 m CAD extent. This never represents a
// physical servo calibration.
function positionProgress(positionMm: number, minPositionMm: number, maxPositionMm: number) {
  const span = Math.max(0.001, maxPositionMm - minPositionMm);
  return Math.min(1, Math.max(0, (positionMm - minPositionMm) / span));
}

// Map calibrated position (0-100 mm default) linearly across CAD safe travel
// range (0 to -0.0555 m). 0 mm is top, 50 mm is exactly 50% travel, 100 mm is full safe stroke.
const TOP_MOVING_ASSEMBLY_X_METERS = 0;
const LOWER_SAFE_MOVING_ASSEMBLY_X_METERS = -0.0555;
function positionToAssemblyX(positionMm: number, minPositionMm: number, maxPositionMm: number) {
  const progress = positionProgress(positionMm, minPositionMm, maxPositionMm);
  return TOP_MOVING_ASSEMBLY_X_METERS + progress * (LOWER_SAFE_MOVING_ASSEMBLY_X_METERS - TOP_MOVING_ASSEMBLY_X_METERS);
}

function initialAssetStatus() {
  return toolheadParts.reduce((result, asset) => {
    result[asset.key] = "checking";
    return result;
  }, {} as Record<ToolheadPartKey, AssetStatus>);
}

async function isBinaryGlb(url: string) {
  const response = await fetch(url, { cache: "no-store", headers: { Range: "bytes=0-3" } });
  if (!response.ok) return false;
  const bytes = new Uint8Array(await response.arrayBuffer());
  return bytes.length >= 4 && String.fromCharCode(...bytes.slice(0, 4)) === "glTF";
}

class ToolheadPartErrorBoundary extends Component<{
  asset: ToolheadPartAsset;
  onFailure: (key: ToolheadPartKey) => void;
  children: ReactNode;
}, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onFailure(this.props.asset.key);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function ToolheadPart({ asset, onLoaded }: { asset: ToolheadPartAsset; onLoaded: (key: ToolheadPartKey) => void }) {
  const { scene } = useGLTF(asset.url);
  const configuredScene = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const tintMaterial = (material: Material) => {
        const configured = material.clone();
        if (configured instanceof MeshStandardMaterial) {
          configured.color.set(asset.color);
          configured.metalness = asset.metalness;
          configured.roughness = asset.roughness;
          if (asset.emissive) configured.emissive.set(asset.emissive);
        }
        return configured;
      };
      object.material = Array.isArray(object.material)
        ? object.material.map(tintMaterial)
        : tintMaterial(object.material);
    });
    return clone;
  }, [asset, scene]);
  const quaternion = useMemo(() => asset.quaternion ? new Quaternion(...asset.quaternion) : undefined, [asset]);

  useEffect(() => onLoaded(asset.key), [asset.key, onLoaded]);

  return (
    <group position={asset.position} quaternion={quaternion} name={asset.label.replace(/ /g, "_").toUpperCase()}>
      <primitive object={configuredScene} />
    </group>
  );
}

function MovingAssembly({ assets, positionMm, minPositionMm, maxPositionMm, motion, onLoaded, onFailure }: {
  assets: ToolheadPartAsset[];
  positionMm: number;
  minPositionMm: number;
  maxPositionMm: number;
  motion: "MOVING" | "STOPPED" | "ERROR";
  onLoaded: (key: ToolheadPartKey) => void;
  onFailure: (key: ToolheadPartKey) => void;
}) {
  const movingRef = useRef<Group>(null);
  const currentMm = useRef(positionMm);
  const renderedMm = useRef(positionMm);
  const pusher = assets.find((asset) => asset.key === "pusher");
  const toolHead = assets.find((asset) => asset.key === "toolHead");

  useEffect(() => {
    currentMm.current = positionMm;
    if (motion !== "MOVING") renderedMm.current = positionMm;
  }, [motion, positionMm]);

  useFrame((_state, delta) => {
    renderedMm.current += (currentMm.current - renderedMm.current) * Math.min(1, delta * 14);
    if (movingRef.current) {
      movingRef.current.position.x = positionToAssemblyX(renderedMm.current, minPositionMm, maxPositionMm);
    }
  });

  return (
    <group ref={movingRef} name="MOVING_ASSEMBLY" position={[positionToAssemblyX(positionMm, minPositionMm, maxPositionMm), 0, 0]}>
      <group name="PUSHER_GROUP">
        {pusher ? <ToolheadPartErrorBoundary asset={pusher} onFailure={onFailure}>
          <Suspense fallback={null}>
            <ToolheadPart asset={pusher} onLoaded={onLoaded} />
          </Suspense>
        </ToolheadPartErrorBoundary> : null}
        <group name="TOOLHEAD_GROUP" position={TOOLHEAD_MOUNT_POSITION} quaternion={TOOLHEAD_MOUNT_QUATERNION}>
          {toolHead ? <ToolheadPartErrorBoundary asset={toolHead} onFailure={onFailure}>
            <Suspense fallback={null}>
              <ToolheadPart asset={toolHead} onLoaded={onLoaded} />
            </Suspense>
          </ToolheadPartErrorBoundary> : null}
        </group>
      </group>
    </group>
  );
}

function CameraFramer({ assemblyRef, assemblyReady }: { assemblyRef: React.RefObject<Group | null>; assemblyReady: boolean }) {
  const { camera } = useThree();
  const [target, setTarget] = useState<[number, number, number]>([0, 0, 0]);

  useEffect(() => {
    if (!assemblyReady || !assemblyRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      if (!assemblyRef.current) return;
      const bounds = new Box3().setFromObject(assemblyRef.current);
      if (bounds.isEmpty()) return;
      const center = bounds.getCenter(new Vector3());
      const size = bounds.getSize(new Vector3());
      const largestDimension = Math.max(size.x, size.y, size.z, 0.2);
      const fov = camera instanceof PerspectiveCamera ? camera.fov : 38;
      const distance = (largestDimension / 2 / Math.tan(MathUtils.degToRad(fov / 2))) * 1.9;

      camera.position.copy(center).add(new Vector3(distance * 0.82, distance * 0.72, distance));
      camera.lookAt(center);
      camera.updateProjectionMatrix();
      setTarget([center.x, center.y, center.z]);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [assemblyReady, assemblyRef, camera]);

  return <OrbitControls enablePan minDistance={0.12} maxDistance={3} target={target} />;
}

function ToolheadAssembly({ assets, resolvedPartCount, positionMm, minPositionMm, maxPositionMm, motion, onLoaded, onFailure }: {
  assets: ToolheadPartAsset[];
  resolvedPartCount: number;
  positionMm: number;
  minPositionMm: number;
  maxPositionMm: number;
  motion: "MOVING" | "STOPPED" | "ERROR";
  onLoaded: (key: ToolheadPartKey) => void;
  onFailure: (key: ToolheadPartKey) => void;
}) {
  const assemblyRef = useRef<Group>(null);
  const fixedAssets = assets.filter((asset) => !asset.moving);
  const movingAssets = assets.filter((asset) => asset.moving);
  const assemblyReady = resolvedPartCount === toolheadParts.length;

  return (
    <>
      <group ref={assemblyRef} name="TOOLHEAD_ASSEMBLY" rotation={[0, 0, Math.PI / 2]}>
        <group name="FIXED_ASSEMBLY">
          {fixedAssets.map((asset) => (
            <ToolheadPartErrorBoundary key={asset.key} asset={asset} onFailure={onFailure}>
              <Suspense fallback={null}>
                <ToolheadPart asset={asset} onLoaded={onLoaded} />
              </Suspense>
            </ToolheadPartErrorBoundary>
          ))}
        </group>
        <MovingAssembly assets={movingAssets} positionMm={positionMm} minPositionMm={minPositionMm} maxPositionMm={maxPositionMm} motion={motion} onLoaded={onLoaded} onFailure={onFailure} />
      </group>
      <CameraFramer assemblyRef={assemblyRef} assemblyReady={assemblyReady} />
    </>
  );
}

function ToolheadScene({ assets, resolvedPartCount, positionMm, minPositionMm, maxPositionMm, motion, onLoaded, onFailure }: {
  assets: ToolheadPartAsset[];
  resolvedPartCount: number;
  positionMm: number;
  minPositionMm: number;
  maxPositionMm: number;
  motion: "MOVING" | "STOPPED" | "ERROR";
  onLoaded: (key: ToolheadPartKey) => void;
  onFailure: (key: ToolheadPartKey) => void;
}) {
  return (
    <Canvas camera={{ position: [0.45, 0.36, 0.58], fov: 38 }} dpr={[1, 2]}>
      <color attach="background" args={["#070b12"]} />
      <ambientLight intensity={1.25} />
      <directionalLight position={[0.55, 0.85, 0.65]} intensity={2.4} color="#d8efff" />
      <pointLight position={[-0.35, 0.2, 0.35]} intensity={1.8} color="#28d7ff" distance={2.5} />
      <pointLight position={[0.2, -0.15, -0.3]} intensity={1.2} color="#f4b24d" distance={1.6} />
      <gridHelper args={[0.9, 18, "#273244", "#17202d"]} position={[0, -0.19, 0]} />
      <ToolheadAssembly assets={assets} resolvedPartCount={resolvedPartCount} positionMm={positionMm} minPositionMm={minPositionMm} maxPositionMm={maxPositionMm} motion={motion} onLoaded={onLoaded} onFailure={onFailure} />
    </Canvas>
  );
}

export function ToolheadDigitalTwin() {
  const mode = useToolheadStore((state) => state.mode);
  const positionMm = useToolheadStore((state) => state.positionMm);
  const targetPositionMm = useToolheadStore((state) => state.targetPositionMm);
  const servoAngle = useToolheadStore((state) => state.servoAngle);
  const direction = useToolheadStore((state) => state.direction);
  const motion = useToolheadStore((state) => state.motion);
  const physicalState = useToolheadStore((state) => state.physicalState);
  const esp32Connected = useToolheadStore((state) => state.esp32Connected);
  const controllerName = useToolheadStore((state) => state.controllerName);
  const controllerChip = useToolheadStore((state) => state.controllerChip);
  const controllerPort = useToolheadStore((state) => state.controllerPort);
  const controllerTransport = useToolheadStore((state) => state.controllerTransport);
  const calibration = useToolheadStore((state) => state.calibration);
  const error = useToolheadStore((state) => state.error);
  const simulationSpeedMmPerSec = useToolheadStore((state) => state.simulationSpeedMmPerSec);
  const [assetStatus, setAssetStatus] = useState<Record<ToolheadPartKey, AssetStatus>>(initialAssetStatus);
  const [loadedParts, setLoadedParts] = useState<ToolheadPartKey[]>([]);
  const [positionDraft, setPositionDraft] = useState(String(positionMm));
  const [theme, setTheme] = useState<ToolheadTheme>("dark");
  const permissions = useAuthStore((state) => state.permissions);
  const canControlPhysical = permissions.canControlPhysicalMachine;
  const [serialStatus, setSerialStatus] = useState<WebSerialStatus>(webSerialService.getStatus());
  const [serialError, setSerialError] = useState<string | null>(webSerialService.getLastError());
  const isSerialSupported = useMemo(() => webSerialService.isSupported(), []);

  useEffect(() => {
    return webSerialService.onStatusChange((status, err) => {
      setSerialStatus(status);
      setSerialError(err ?? null);
    });
  }, []);

  useEffect(() => {
    if (!canControlPhysical && mode !== "simulation") {
      setToolheadMode("simulation");
    }
  }, [canControlPhysical, mode]);

  useEffect(() => { setPositionDraft(positionMm.toFixed(2)); }, [positionMm]);
  useEffect(() => {
    const savedTheme = window.localStorage.getItem(TOOLHEAD_THEME_KEY);
    if (savedTheme === "dark" || savedTheme === "light") setTheme(savedTheme);
  }, []);
  useEffect(() => { window.localStorage.setItem(TOOLHEAD_THEME_KEY, theme); }, [theme]);
  useEffect(() => {
    let active = true;
    Promise.all(toolheadParts.map(async (asset) => ({ key: asset.key, valid: await isBinaryGlb(asset.url) }))).then((results) => {
      if (!active) return;
      setAssetStatus((current) => {
        const next = { ...current };
        results.forEach((result) => { next[result.key] = result.valid ? "ready" : "failed"; });
        return next;
      });
    });
    return () => { active = false; };
  }, []);

  const handleLoaded = useCallback((key: ToolheadPartKey) => {
    setLoadedParts((current) => current.includes(key) ? current : [...current, key]);
  }, []);
  const handleFailure = useCallback((key: ToolheadPartKey) => {
    setAssetStatus((current) => current[key] === "failed" ? current : { ...current, [key]: "failed" });
  }, []);

  const loadableAssets = toolheadParts.filter((asset) => assetStatus[asset.key] === "ready");
  const failedParts = toolheadParts.filter((asset) => assetStatus[asset.key] === "failed");
  const checking = toolheadParts.some((asset) => assetStatus[asset.key] === "checking");
  const resolvedPartCount = loadedParts.length + failedParts.filter((asset) => !loadedParts.includes(asset.key)).length;
  const allAssetsLoaded = resolvedPartCount === toolheadParts.length && failedParts.length === 0;
  const middlePositionMm = (calibration.minPositionMm + calibration.maxPositionMm) / 2;
  const currentTravelProgress = positionProgress(positionMm, calibration.minPositionMm, calibration.maxPositionMm);
  const setPosition = () => {
    const requested = Number(positionDraft);
    if (!Number.isFinite(requested)) return setToolheadPosition(requested);
    const clamped = Math.min(calibration.maxPositionMm, Math.max(calibration.minPositionMm, requested));
    setPositionDraft(clamped.toFixed(2));
    return setToolheadPosition(requested);
  };
  const physicalReady = esp32Connected;
  const commandDisabled = mode === "physical" && !physicalReady;
  const referenceDisabled = commandDisabled;
  const moveToReference = (position: number) => {
    setPositionDraft(position.toFixed(2));
    return setToolheadPosition(position);
  };
  const assetStatusLabel = checking
    ? "Checking six toolhead components"
    : failedParts.length
      ? `Toolhead component failed: ${failedParts.map((asset) => asset.label).join(", ")}`
      : allAssetsLoaded
        ? "Six CAD components active"
        : "Loading toolhead components";

  return (
    <div className="toolhead-workbench" data-theme={theme}>
      <Panel
        title="Toolhead Digital Twin"
        eyebrow="Industrial motion control"
        accent="cyan"
        className="toolhead-shell"
        action={
          <button className="toolhead-theme-toggle" onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")} type="button" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            <span>{theme === "dark" ? "Light" : "Dark"}</span>
          </button>
        }
      >
      <div className="toolhead-status-strip">
        <div><span>System</span><strong>{mode === "simulation" ? "Simulation" : esp32Connected ? "Connected" : "Disconnected"}</strong></div>
        <div><span>Controller</span><strong>{mode === "physical" ? controllerName ?? "Awaiting telemetry" : "3D only"}</strong></div>
        <div><span>State</span><strong>{mode === "physical" ? physicalState.replace(/_/g, " ") : "Simulation"}</strong></div>
        <div><span>Motion</span><strong>{motion}</strong></div>
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="toolhead-viewport">
          <ToolheadScene assets={loadableAssets} resolvedPartCount={resolvedPartCount} positionMm={positionMm} minPositionMm={calibration.minPositionMm} maxPositionMm={calibration.maxPositionMm} motion={motion} onLoaded={handleLoaded} onFailure={handleFailure} />
          <div className="toolhead-viewport-header">
            <div><span>Toolhead view</span><strong>{mode === "physical" ? "Physical digital twin" : "Simulation digital twin"}</strong></div>
            <div><span>Motion</span><strong>{motion}</strong></div>
          </div>
          <div className="toolhead-viewport-footer"><Box size={13} /> {assetStatusLabel}</div>
          <div className="toolhead-travel-scale">
            <span>Top <b>{calibration.minPositionMm.toFixed(0)} mm</b></span>
            <div className="toolhead-travel-track">
              <span>Middle <b>{middlePositionMm.toFixed(0)}</b></span>
              <span className="toolhead-travel-marker" style={{ top: `${currentTravelProgress * 100}%` }}><i />{positionMm.toFixed(1)}</span>
            </div>
            <span>Low <b>{calibration.maxPositionMm.toFixed(0)} mm</b></span>
          </div>
        </div>
        <div className="toolhead-control-column">
          {canControlPhysical ? (
            <div className="space-y-2">
              <div className="toolhead-mode-switch">
                {(["simulation", "physical"] as const).map((nextMode) => (
                  <button key={nextMode} className={mode === nextMode ? "is-active" : ""} onClick={() => setToolheadMode(nextMode)} type="button">
                    <span>{nextMode === "simulation" ? "Simulation" : "Physical"}</span><small>{nextMode === "simulation" ? "3D only" : "ESP32 control"}</small>
                  </button>
                ))}
              </div>

              {mode === "physical" ? (
                <div className="rounded-lg border border-plant-cyan/40 bg-plant-deck/80 p-3 space-y-2.5 shadow-md">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold uppercase tracking-wider text-plant-muted flex items-center gap-1.5">
                      <Usb size={14} className="text-plant-cyan" /> Direct USB Web Serial
                    </span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                      serialStatus === "connected"
                        ? "bg-plant-green/20 text-plant-green border border-plant-green/40"
                        : serialStatus === "connecting"
                        ? "bg-plant-amber/20 text-plant-amber border border-plant-amber/40"
                        : "bg-plant-muted/20 text-plant-muted border border-plant-line"
                    }`}>
                      {serialStatus === "connected" ? "115200 Baud" : serialStatus}
                    </span>
                  </div>

                  {!isSerialSupported ? (
                    <div className="text-[11px] text-plant-amber leading-relaxed">
                      Web Serial API is supported in Google Chrome and Microsoft Edge on HTTPS.
                    </div>
                  ) : serialStatus === "connected" ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-plant-muted">
                        <span>Device: <strong className="text-plant-text">{controllerChip ?? "ESP32-D0WD-V3"}</strong></span>
                        <span>Servo: <strong className={calibration.servoArmed ? "text-plant-green" : "text-plant-amber"}>{calibration.servoArmed ? "Armed" : "Disarmed"}</strong></span>
                      </div>
                      <div className="flex gap-2">
                        {!calibration.servoArmed ? (
                          <button
                            type="button"
                            onClick={() => armToolheadController()}
                            className="flex-1 rounded bg-plant-amber px-2.5 py-1.5 text-xs font-bold uppercase tracking-wider text-plant-void hover:bg-plant-amber/90 transition shadow"
                          >
                            Arm Controller
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => webSerialService.disconnect()}
                          className="flex-1 rounded border border-plant-red/60 bg-plant-red/10 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-plant-red hover:bg-plant-red/20 transition"
                        >
                          Disconnect USB
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={serialStatus === "connecting"}
                      onClick={async () => {
                        await webSerialService.connect();
                      }}
                      className="w-full flex items-center justify-center gap-2 rounded bg-plant-cyan px-3 py-2 text-xs font-bold uppercase tracking-wider text-plant-void hover:bg-plant-cyan/90 transition shadow disabled:opacity-50"
                    >
                      <Usb size={14} />
                      {serialStatus === "connecting" ? "Connecting..." : "Connect ESP32 (USB)"}
                    </button>
                  )}

                  {serialError ? (
                    <div className="text-[10px] text-plant-red leading-tight">
                      {serialError}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded border border-plant-cyan/40 bg-plant-cyan/10 p-2.5 text-center text-xs">
              <span className="font-bold uppercase tracking-wider text-plant-cyan">3D Simulation Mode</span>
              <p className="mt-0.5 text-[10px] text-plant-muted">Interactive browser-local CAD kinematics & positioning</p>
            </div>
          )}
          <section className="toolhead-position-readout">
            <span>Current position</span>
            <strong>{positionMm.toFixed(2)} <small>mm</small></strong>
            <div className="toolhead-progress" aria-label={`Position ${positionMm.toFixed(2)} millimetres`}><i style={{ width: `${currentTravelProgress * 100}%` }} /></div>
            <div><span>{calibration.minPositionMm.toFixed(0)} mm</span><span>{calibration.maxPositionMm.toFixed(0)} mm</span></div>
          </section>
          <section className="toolhead-control-section">
            <div className="toolhead-section-heading"><span>Motion control</span><small>{direction} / {motion}</small></div>
            <div className="toolhead-motion-buttons">
              <button className="toolhead-motion-button" disabled={commandDisabled} onClick={moveToolheadUp} type="button"><ArrowUp size={17} /><span>Up</span></button>
              <button className="toolhead-stop-button" onClick={stopToolhead} type="button"><Square size={15} /><span>Stop</span></button>
              <button className="toolhead-motion-button" disabled={commandDisabled} onClick={moveToolheadDown} type="button"><ArrowDown size={17} /><span>Down</span></button>
            </div>
          </section>
          <section className="toolhead-control-section">
            <div className="toolhead-section-heading"><span>Reference positions</span><small>{calibration.minPositionMm.toFixed(0)}-{calibration.maxPositionMm.toFixed(0)} mm travel</small></div>
            <div className="toolhead-preset-buttons">
              <button disabled={referenceDisabled} onClick={() => moveToReference(calibration.minPositionMm)} type="button"><b>Top</b><small>{calibration.minPositionMm.toFixed(0)} mm</small></button>
              <button disabled={referenceDisabled} onClick={() => moveToReference(middlePositionMm)} type="button"><b>Middle</b><small>{middlePositionMm.toFixed(0)} mm</small></button>
              <button disabled={referenceDisabled} onClick={() => moveToReference(calibration.maxPositionMm)} type="button"><b>Low</b><small>{calibration.maxPositionMm.toFixed(0)} mm</small></button>
            </div>
          </section>
          <section className="toolhead-target-control">
            <div className="toolhead-section-heading"><span>Target position</span><small>mm</small></div>
            <div>
              <input inputMode="decimal" value={positionDraft} onChange={(event) => setPositionDraft(event.target.value)} aria-label="Target position in millimetres" />
              <button disabled={commandDisabled} onClick={setPosition} type="button">Move</button>
            </div>
            <small>Safe travel {calibration.minPositionMm.toFixed(0)}-{calibration.maxPositionMm.toFixed(0)} mm</small>
          </section>
          <section className="toolhead-speed-control">
            <div className="toolhead-section-heading"><span>Speed</span><output>{simulationSpeedMmPerSec.toFixed(0)} mm/s</output></div>
            <input type="range" min="1" max="50" step="1" value={simulationSpeedMmPerSec} disabled={mode === "physical" && !physicalReady} onChange={(event) => setToolheadSpeed(Number(event.target.value))} aria-label="Toolhead movement speed" />
            <div><span>1 mm/s</span><span>50 mm/s</span></div>
            {mode === "physical" ? (
              <small className="mt-2 block text-plant-red-light leading-snug">
                <strong>Safety Notice:</strong> Position is an open-loop estimate. Software limits cannot guarantee protection against mechanical overtravel without reliable homing or physical limit switches. Be prepared to hit STOP.
              </small>
            ) : null}
          </section>
          </div>

          <div className="toolhead-telemetry-grid">
            <div><span>Target</span><strong>{targetPositionMm.toFixed(2)} <small>mm</small></strong><small>{mode === "physical" ? "Controller target" : "Simulation target"}</small></div>
            <div><span>Servo</span><strong>{servoAngle === null ? "--" : servoAngle.toFixed(1)} <small>deg</small></strong><small>{calibration.positionSource.replace(/_/g, " ")}</small></div>
            <div><span>Speed</span><strong>{simulationSpeedMmPerSec.toFixed(0)} <small>mm/s</small></strong><small>{mode === "simulation" ? "Digital simulation" : "Controller telemetry"}</small></div>
            {mode === "physical" ? <div><span>Controller</span><strong>{controllerName ?? "--"}</strong><small>{esp32Connected ? `${controllerChip ?? "Unknown chip"} / ${controllerPort ?? "Unknown port"} / ${controllerTransport ?? "unknown transport"} / 115200` : "Waiting for controller telemetry"}</small></div> : null}
          </div>
          {failedParts.length ? <div className="toolhead-error-note">Toolhead component failed: {failedParts.map((asset) => asset.label).join(", ")}</div> : null}
          {error ? <div className="toolhead-error-note">{error}</div> : null}
          <div className="toolhead-footnote"><Cpu size={13} /> ESP32 state-driven rendering<span /><Radio size={13} /> Live telemetry</div>
        </div>
      </Panel>
    </div>
  );
}
