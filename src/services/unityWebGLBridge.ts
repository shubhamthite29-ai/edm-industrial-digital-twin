import type { GatewayMessage } from "../Realtime/RealtimeClient";

export interface UnityInstance {
  SendMessage?: (gameObjectName: string, methodName: string, parameter?: string | number) => void;
  SetFullscreen: (enabled: 0 | 1) => void;
  Quit?: () => Promise<void>;
}

type LocalMessageHandler = (message: GatewayMessage) => void;
type ReadyHandler = (ready: boolean) => void;

const localGatewayUrls = new Set(["ws://localhost:8080", "ws://127.0.0.1:8080"]);
const messageHandlers = new Set<LocalMessageHandler>();
const readyHandlers = new Set<ReadyHandler>();
const localSockets = new Set<LocalUnityWebSocket>();

let installed = false;
let nativeWebSocket: typeof WebSocket | null = null;
let unityInstance: UnityInstance | null = null;

function shouldUseBrowserLocalGateway() {
  const configuredBackend = import.meta.env.VITE_LIVE_WS_URL;
  const explicitlyDisabled = import.meta.env.VITE_ENABLE_LOCAL_UNITY_GATEWAY === "false";
  const explicitlyEnabled = import.meta.env.VITE_ENABLE_LOCAL_UNITY_GATEWAY === "true";

  if (explicitlyDisabled) return false;
  if (explicitlyEnabled) return true;
  return import.meta.env.PROD && !configuredBackend;
}

function isLocalGatewayUrl(url: string | URL) {
  return localGatewayUrls.has(String(url).replace(/\/$/, ""));
}

function notifyReady() {
  const ready = isUnityWebGLReady();
  readyHandlers.forEach((handler) => handler(ready));
}

function notifyLocalMessage(raw: string) {
  try {
    const message = JSON.parse(raw) as GatewayMessage;
    if (!message || typeof message.type !== "string") return;
    messageHandlers.forEach((handler) => handler(message));
  } catch {
    // Unity can only publish JSON gateway packets. Ignore non-protocol frames.
  }
}

function deliverToUnity(raw: string) {
  let delivered = false;

  localSockets.forEach((socket) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.emitMessage(raw);
      delivered = true;
    }
  });

  if (!delivered && unityInstance?.SendMessage) {
    try {
      unityInstance.SendMessage("WebGLSocketBridge", "OnJsMessage", `0|${raw}`);
      delivered = true;
    } catch {
      delivered = false;
    }
  }

  return delivered;
}

class LocalUnityWebSocket extends EventTarget {
  readonly url: string;
  readonly protocol = "";
  readonly extensions = "";
  binaryType: BinaryType = "blob";
  bufferedAmount = 0;
  readyState: number = WebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(url: string) {
    super();
    this.url = url;
    window.setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      localSockets.add(this);
      const event = new Event("open");
      this.onopen?.(event);
      this.dispatchEvent(event);
      notifyReady();
    }, 0);
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
    if (this.readyState !== WebSocket.OPEN) {
      throw new DOMException("Local Unity WebSocket is not open.", "InvalidStateError");
    }

    if (typeof data === "string") {
      notifyLocalMessage(data);
    }
  }

  close(code = 1000, reason = "Local Unity gateway closed") {
    if (this.readyState === WebSocket.CLOSED || this.readyState === WebSocket.CLOSING) return;
    this.readyState = WebSocket.CLOSING;
    window.setTimeout(() => {
      this.readyState = WebSocket.CLOSED;
      localSockets.delete(this);
      const event = new CloseEvent("close", { code, reason, wasClean: true });
      this.onclose?.(event);
      this.dispatchEvent(event);
      notifyReady();
    }, 0);
  }

  emitMessage(data: string) {
    const event = new MessageEvent<string>("message", { data });
    this.onmessage?.(event);
    this.dispatchEvent(event);
  }
}

export function installUnityLocalGateway() {
  if (!shouldUseBrowserLocalGateway() || installed || typeof window === "undefined") return;

  nativeWebSocket = window.WebSocket;
  const NativeWebSocket = nativeWebSocket;

  const BridgedWebSocket = function WebSocketBridge(this: WebSocket, url: string | URL, protocols?: string | string[]) {
    if (isLocalGatewayUrl(url)) {
      return new LocalUnityWebSocket(String(url)) as unknown as WebSocket;
    }
    return protocols === undefined ? new NativeWebSocket(url) : new NativeWebSocket(url, protocols);
  } as unknown as typeof WebSocket;

  Object.defineProperties(BridgedWebSocket, {
    CONNECTING: { value: NativeWebSocket.CONNECTING },
    OPEN: { value: NativeWebSocket.OPEN },
    CLOSING: { value: NativeWebSocket.CLOSING },
    CLOSED: { value: NativeWebSocket.CLOSED },
  });

  window.WebSocket = BridgedWebSocket;
  installed = true;
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
  return unityInstance !== null || localSockets.size > 0;
}

export function onUnityWebGLReadyChange(handler: ReadyHandler) {
  readyHandlers.add(handler);
  handler(isUnityWebGLReady());
  return () => readyHandlers.delete(handler);
}

export function onLocalUnityMessage(handler: LocalMessageHandler) {
  messageHandlers.add(handler);
  return () => messageHandlers.delete(handler);
}

export function sendLocalUnityMessage(message: GatewayMessage) {
  return deliverToUnity(JSON.stringify(message));
}
