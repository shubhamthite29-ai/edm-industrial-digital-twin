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
      this.messageHandlers.forEach((handler) => handler(message));
    } catch {
      // Ignore malformed gateway packets; protocol errors can be surfaced later.
    }
  };

  private handleClose = () => {
    this.socket = null;
    this.setStatus("disconnected");

    if (!this.manuallyClosed) {
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
}

export const realtimeClient = new RealtimeClient();
