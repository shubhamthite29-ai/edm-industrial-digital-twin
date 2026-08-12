import { Maximize2, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { installUnityLocalGateway, registerUnityWebGLInstance, unregisterUnityWebGLInstance, type UnityInstance } from "../services/unityWebGLBridge";
import type { CameraView, ConnectionStatus, MachineLifecycleState, UnityTelemetry } from "../types/twin";

interface UnityWebGLViewerProps {
  connectionStatus: ConnectionStatus;
  machineState: MachineLifecycleState;
  telemetry: UnityTelemetry;
  cameraView: CameraView;
}

interface UnityConfig {
  arguments: string[];
  dataUrl: string;
  frameworkUrl: string;
  codeUrl: string;
  streamingAssetsUrl: string;
  companyName: string;
  productName: string;
  productVersion: string;
  showBanner: (message: string, type?: "error" | "warning" | string) => void;
  devicePixelRatio?: number;
}

declare global {
  interface Window {
    createUnityInstance?: (canvas: HTMLCanvasElement, config: UnityConfig, onProgress?: (progress: number) => void) => Promise<UnityInstance>;
  }
}

const buildFolder = import.meta.env.VITE_UNITY_WEBGL_BUILD_PATH ?? "WebGL/Build";
const buildName = import.meta.env.VITE_UNITY_WEBGL_BUILD_NAME ?? "WebGL";
const dataExtension = import.meta.env.VITE_UNITY_WEBGL_DATA_EXTENSION ?? "data";
const frameworkExtension = import.meta.env.VITE_UNITY_WEBGL_FRAMEWORK_EXTENSION ?? "framework.js";
const wasmExtension = import.meta.env.VITE_UNITY_WEBGL_WASM_EXTENSION ?? "wasm";
const buildUrl = `${import.meta.env.BASE_URL}${buildFolder.replace(/^\/+/, "").replace(/\/+$/, "")}`;
const buildVersion = import.meta.env.VITE_UNITY_WEBGL_BUILD_VERSION ?? "2026-07-23-websocket-bridge";

function versionedUnityAsset(path: string) {
  return `${path}?v=${encodeURIComponent(buildVersion)}`;
}

function loadScriptOnce(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = Array.from(document.querySelectorAll<HTMLScriptElement>("script[data-unity-loader]")).find((script) => script.dataset.unityLoader === src);
    if (existing) {
      if (window.createUnityInstance) resolve();
      else existing.addEventListener("load", () => resolve(), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.unityLoader = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Unable to load Unity WebGL loader: ${src}`));
    document.body.appendChild(script);
  });
}

function percentLabel(value: number) {
  return Number.isFinite(value) ? `${Math.round(value)}%` : "0%";
}

export function UnityWebGLViewer({ connectionStatus, machineState, telemetry, cameraView }: UnityWebGLViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const unityRef = useRef<UnityInstance | null>(null);
  const mountedRef = useRef(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("Loading Unity WebGL...");

  const config = useMemo<UnityConfig>(
    () => ({
      arguments: [],
      dataUrl: versionedUnityAsset(`${buildUrl}/${buildName}.${dataExtension}`),
      frameworkUrl: versionedUnityAsset(`${buildUrl}/${buildName}.${frameworkExtension}`),
      codeUrl: versionedUnityAsset(`${buildUrl}/${buildName}.${wasmExtension}`),
      streamingAssetsUrl: `${import.meta.env.BASE_URL}StreamingAssets`,
      companyName: "DefaultCompany",
      productName: "EDM_DIGITAL_TWIN",
      productVersion: "0.1.0",
      showBanner: (bannerMessage, type) => {
        setMessage(bannerMessage);
        if (type === "error") setLoadState("error");
      },
      devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    }),
    [],
  );

  useEffect(() => {
    mountedRef.current = true;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const loaderUrl = versionedUnityAsset(`${buildUrl}/${buildName}.loader.js`);
    installUnityLocalGateway();
    setLoadState("loading");
    setMessage("Loading Unity WebGL...");

    loadScriptOnce(loaderUrl)
      .then(() => {
        if (!mountedRef.current || !canvas || unityRef.current) return;
        if (!window.createUnityInstance) throw new Error("Unity loader did not expose createUnityInstance().");

        return window.createUnityInstance(canvas, config, (progress) => {
          if (mountedRef.current) setLoadProgress(progress);
        });
      })
      .then((unityInstance) => {
        if (!unityInstance || !mountedRef.current) return;
        unityRef.current = unityInstance;
        registerUnityWebGLInstance(unityInstance);
        setLoadProgress(1);
        setLoadState("ready");
        setMessage("Unity WebGL ready");
      })
      .catch((error: Error) => {
        if (!mountedRef.current) return;
        setLoadState("error");
        setMessage(error.message);
      });

    return () => {
      mountedRef.current = false;
      const unityInstance = unityRef.current;
      unityRef.current = null;
      if (unityInstance) unregisterUnityWebGLInstance(unityInstance);
      unityInstance?.Quit?.().catch(() => undefined);
    };
  }, [config]);

  const progress = telemetry.progressPercent || telemetry.cyclePercent || 0;

  return (
    <div className="relative h-[340px] overflow-hidden rounded border border-plant-line bg-[#05070b]">
      <canvas id="unity-canvas" ref={canvasRef} className="block h-full w-full bg-black outline-none" tabIndex={-1} />

      {loadState !== "ready" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-plant-void/88 px-6 text-center">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-plant-cyan">{loadState === "error" ? "Unity Load Error" : "Unity WebGL"}</div>
          <div className="mt-3 h-2 w-full max-w-sm overflow-hidden rounded bg-plant-line">
            <div className={`h-full ${loadState === "error" ? "bg-plant-red" : "bg-plant-cyan"}`} style={{ width: `${Math.round(loadProgress * 100)}%` }} />
          </div>
          <div className="mt-3 max-w-md text-xs text-plant-muted">{message}</div>
        </div>
      ) : null}

      <div className="pointer-events-none absolute left-3 top-3 rounded border border-plant-cyan/40 bg-plant-void/70 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-plant-cyan">
        Unity WebGL renderer
      </div>

      <div className="pointer-events-none absolute bottom-3 right-3 rounded border border-plant-line bg-plant-void/75 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-plant-muted">
        {machineState} / {percentLabel(progress)} / {cameraView} / {connectionStatus}
      </div>

      <div className="absolute right-3 top-3 flex gap-2">
        <button
          className="flex h-8 w-8 items-center justify-center rounded border border-plant-line bg-plant-void/75 text-plant-muted transition hover:text-plant-text"
          onClick={() => unityRef.current?.SetFullscreen(1)}
          title="Fullscreen"
          type="button"
        >
          <Maximize2 size={15} />
        </button>
        <button
          className="flex h-8 w-8 items-center justify-center rounded border border-plant-line bg-plant-void/75 text-plant-muted transition hover:text-plant-text"
          onClick={() => window.location.reload()}
          title="Reload Unity"
          type="button"
        >
          <RotateCcw size={15} />
        </button>
      </div>
    </div>
  );
}
