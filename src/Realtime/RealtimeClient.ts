export type ConnectionStatus = "connected" | "connecting" | "disconnected";

export interface GatewayMessage {
  schemaVersion?: string;
  messageId?: string;
  timestamp?: string;
  source?: string;
  type: string;
  payload?: Record<string, unknown>;
}

type MessageHandler = (message: GatewayMessage) => void;
type StatusHandler = (status: ConnectionStatus) => void;
type DiagnosticsHandler = (diagnostics: RealtimeDiagnostics) => void;

export interface RealtimeLogEntry {
  direction: "in" | "out" | "system";
  timestamp: string;
  type: string;
  summary: string;
}

export interface RealtimeDiagnostics {
  packetsSent: number;
  packetsReceived: number;
  reconnectCount: number;
  latencyMs: number | null;
  lastMessages: RealtimeLogEntry[];
}

interface RealtimeClientOptions {
  url?: string;
  role?: "react" | "unity";
  reconnectDelayMs?: number;
}

export class RealtimeClient {
  private readonly url: string;
  private readonly role: "react" | "unity";
  private readonly reconnectDelayMs: number;
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private manuallyClosed = false;
  private messageHandlers = new Set<MessageHandler>();
  private statusHandlers = new Set<StatusHandler>();
  private diagnosticsHandlers = new Set<DiagnosticsHandler>();
  private pendingMessages = new Map<string, number>();
  private diagnostics: RealtimeDiagnostics = {
    packetsSent: 0,
    packetsReceived: 0,
    reconnectCount: 0,
    latencyMs: null,
    lastMessages: [],
  };
  private status: ConnectionStatus = "disconnected";

  constructor(options: RealtimeClientOptions = {}) {
    this.url = options.url ?? "ws://localhost:8080";
    this.role = options.role ?? "react";
    this.reconnectDelayMs = options.reconnectDelayMs ?? 2000;
  }

  getStatus() {
    return this.status;
  }

  connect() {
    if (this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.manuallyClosed = false;
    this.setStatus("connecting");

    try {
      this.socket = new WebSocket(this.url);
      this.socket.addEventListener("open", this.handleOpen);
      this.socket.addEventListener("message", this.handleMessage);
      this.socket.addEventListener("close", this.handleClose);
      this.socket.addEventListener("error", this.handleError);
    } catch {
      this.setStatus("disconnected");
      this.scheduleReconnect();
    }
  }

  disconnect() {
    this.manuallyClosed = true;
    this.clearReconnectTimer();

    if (this.socket) {
      this.socket.removeEventListener("open", this.handleOpen);
      this.socket.removeEventListener("message", this.handleMessage);
      this.socket.removeEventListener("close", this.handleClose);
      this.socket.removeEventListener("error", this.handleError);
      this.socket.close();
      this.socket = null;
    }

    this.setStatus("disconnected");
  }

  send(message: GatewayMessage) {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return false;
    }

    const envelope: GatewayMessage = {
      schemaVersion: message.schemaVersion ?? "1.0",
      messageId: message.messageId ?? crypto.randomUUID(),
      timestamp: message.timestamp ?? new Date().toISOString(),
      source: message.source ?? this.role,
      type: message.type,
      payload: message.payload ?? {},
    };

    this.socket.send(JSON.stringify(envelope));
    if (envelope.messageId) {
      this.pendingMessages.set(envelope.messageId, performance.now());
    }
    this.updateDiagnostics({
      packetsSent: this.diagnostics.packetsSent + 1,
      lastMessages: this.pushLog({
        direction: "out",
        timestamp: new Date().toISOString(),
        type: envelope.type,
        summary: JSON.stringify(envelope.payload ?? {}),
      }),
    });
    return true;
  }

  onMessage(handler: MessageHandler) {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onStatusChange(handler: StatusHandler) {
    this.statusHandlers.add(handler);
    handler(this.status);
    return () => this.statusHandlers.delete(handler);
  }

  onDiagnostics(handler: DiagnosticsHandler) {
    this.diagnosticsHandlers.add(handler);
    handler(this.diagnostics);
    return () => this.diagnosticsHandlers.delete(handler);
  }

  ping() {
    return this.send({
      type: "heartbeat",
      payload: {
        status: "ping",
      },
    });
  }

  private handleOpen = () => {
    this.clearReconnectTimer();
    this.setStatus("connected");
    this.send({
      type: "client.hello",
      payload: {
        role: this.role,
      },
    });
  };

  private handleMessage = (event: MessageEvent<string>) => {
    try {
      const message = JSON.parse(event.data) as GatewayMessage;
      if (!message || typeof message.type !== "string") return;
      this.trackIncoming(message);
      this.messageHandlers.forEach((handler) => handler(message));
    } catch {
      // Ignore malformed gateway packets; protocol errors can be surfaced later.
    }
  };

  private handleClose = () => {
    this.socket = null;
    this.setStatus("disconnected");

    if (!this.manuallyClosed) {
      this.updateDiagnostics({
        reconnectCount: this.diagnostics.reconnectCount + 1,
        lastMessages: this.pushLog({
          direction: "system",
          timestamp: new Date().toISOString(),
          type: "reconnect",
          summary: "WebSocket closed; reconnect scheduled.",
        }),
      });
      this.scheduleReconnect();
    }
  };

  private handleError = () => {
    this.setStatus("disconnected");
  };

  private scheduleReconnect() {
    if (this.manuallyClosed || this.reconnectTimer !== null) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelayMs);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer === null) return;
    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private setStatus(status: ConnectionStatus) {
    if (this.status === status) return;
    this.status = status;
    this.statusHandlers.forEach((handler) => handler(status));
  }

  private trackIncoming(message: GatewayMessage) {
    let latencyMs = this.diagnostics.latencyMs;
    const ackedMessageId = typeof message.payload?.messageId === "string" ? message.payload.messageId : null;

    if (ackedMessageId && this.pendingMessages.has(ackedMessageId)) {
      latencyMs = Math.round(performance.now() - this.pendingMessages.get(ackedMessageId)!);
      this.pendingMessages.delete(ackedMessageId);
    }

    this.updateDiagnostics({
      packetsReceived: this.diagnostics.packetsReceived + 1,
      latencyMs,
      lastMessages: this.pushLog({
        direction: "in",
        timestamp: new Date().toISOString(),
        type: message.type,
        summary: JSON.stringify(message.payload ?? {}),
      }),
    });
  }

  private pushLog(entry: RealtimeLogEntry) {
    return [entry, ...this.diagnostics.lastMessages].slice(0, 20);
  }

  private updateDiagnostics(partial: Partial<RealtimeDiagnostics>) {
    this.diagnostics = { ...this.diagnostics, ...partial };
    this.diagnosticsHandlers.forEach((handler) => handler(this.diagnostics));
  }
}

export const realtimeClient = new RealtimeClient();
