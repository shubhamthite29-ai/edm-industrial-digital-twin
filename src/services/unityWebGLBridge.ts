import type { GatewayMessage } from "../Realtime/RealtimeClient";

export interface UnityInstance {
  SetFullscreen: (enabled: 0 | 1) => void;
  Quit?: () => Promise<void>;
}

type ReadyHandler = (ready: boolean) => void;

const readyHandlers = new Set<ReadyHandler>();

let unityInstance: UnityInstance | null = null;

function notifyReady() {
  const ready = isUnityWebGLReady();
  readyHandlers.forEach((handler) => handler(ready));
}

export function installUnityLocalGateway() {
  // Unity's generated WebGL WebSocket glue calls browser APIs from wasm. Do not
  // replace window.WebSocket or send to guessed GameObject names: both can turn
  // a missing Unity method into an unrecoverable `RuntimeError: null function`.
  // Native WebSocket remains the single transport for the gateway.
}

export function registerUnityWebGLInstance(instance: UnityInstance) {
  unityInstance = instance;
  notifyReady();
}

export function unregisterUnityWebGLInstance(instance: UnityInstance) {
  if (unityInstance === instance) {
    unityInstance = null;
    notifyReady();
  }
}

export function isUnityWebGLReady() {
  return unityInstance !== null;
}

export function onUnityWebGLReadyChange(handler: ReadyHandler) {
  readyHandlers.add(handler);
  handler(isUnityWebGLReady());
  return () => readyHandlers.delete(handler);
}

export function sendLocalUnityMessage(message: GatewayMessage) {
  // The compiled player owns its WebSocket endpoint. Dashboard commands are
  // delivered through RealtimeClient; no unverified SendMessage fallback exists.
  void message;
  return false;
}
