/**
 * Direct Browser Web Serial Service for ESP32 (WROOM-32 / D0WD-V3)
 *
 * Enables direct USB communication from Chrome/Edge on HTTPS GitHub Pages
 * without requiring any local Node.js gateway, CMD, or PowerShell bridge.
 * Protocol: 115200 baud, newline-delimited JSON (toolhead-json).
 */

export type WebSerialStatus = "disconnected" | "connecting" | "connected" | "error";

export interface SerialPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}

interface SerialOptions {
  baudRate: number;
  dataBits?: number;
  stopBits?: number;
  parity?: "none" | "even" | "odd";
  bufferSize?: number;
  flowControl?: "none" | "hardware";
}

interface SerialPortLike {
  open(options: SerialOptions): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  getInfo(): SerialPortInfo;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
}

export type WebSerialPacketHandler = (packet: { type: string; payload?: Record<string, unknown>; timestamp?: string }) => void;
export type WebSerialStatusHandler = (status: WebSerialStatus, errorMessage?: string | null) => void;

class WebSerialService {
  private port: SerialPortLike | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private status: WebSerialStatus = "disconnected";
  private lastError: string | null = null;
  private isReading = false;
  private keepaliveTimer: number | null = null;
  private packetHandlers = new Set<WebSerialPacketHandler>();
  private statusHandlers = new Set<WebSerialStatusHandler>();
  private textDecoder = new TextDecoder();
  private textEncoder = new TextEncoder();
  private lineBuffer = "";
  private portInfo: SerialPortInfo | null = null;
  private lastPacketReceivedAt: string | null = null;
  private packetCount = 0;

  constructor() {
    if (typeof window !== "undefined" && "navigator" in window && "serial" in navigator) {
      (navigator as unknown as { serial: EventTarget }).serial.addEventListener?.("disconnect", (event: Event) => {
        const customEvent = event as Event & { port?: SerialPortLike };
        if (customEvent.port && customEvent.port === this.port) {
          console.warn("[webSerial] ESP32 device physically unplugged.");
          this.disconnect();
        }
      });
    }
  }

  /**
   * Check if the current browser environment supports the Web Serial API.
   * Web Serial is supported in Chrome, Edge, and Opera (Chromium-based browsers) on secure contexts (HTTPS/localhost).
   */
  public isSupported(): boolean {
    return typeof window !== "undefined" && typeof navigator !== "undefined" && "serial" in navigator;
  }

  public getStatus(): WebSerialStatus {
    return this.status;
  }

  public isConnected(): boolean {
    return this.status === "connected" && this.port !== null;
  }

  public getLastError(): string | null {
    return this.lastError;
  }

  public getPortInfo(): SerialPortInfo | null {
    return this.portInfo;
  }

  public getLastPacketReceivedAt(): string | null {
    return this.lastPacketReceivedAt;
  }

  public getPacketCount(): number {
    return this.packetCount;
  }

  public onPacket(handler: WebSerialPacketHandler): () => void {
    this.packetHandlers.add(handler);
    return () => {
      this.packetHandlers.delete(handler);
    };
  }

  public onStatusChange(handler: WebSerialStatusHandler): () => void {
    this.statusHandlers.add(handler);
    // Immediately emit current state
    handler(this.status, this.lastError);
    return () => {
      this.statusHandlers.delete(handler);
    };
  }

  private setStatus(newStatus: WebSerialStatus, errorMessage: string | null = null) {
    this.status = newStatus;
    this.lastError = errorMessage;
    this.statusHandlers.forEach((handler) => {
      try {
        handler(newStatus, errorMessage);
      } catch (err) {
        console.error("[webSerial] Error in status handler:", err);
      }
    });
  }

  /**
   * Request user permission for an ESP32 COM port and open at 115200 baud.
   */
  public async connect(): Promise<boolean> {
    if (!this.isSupported()) {
      const msg = "Web Serial API is not supported in this browser. Please use Google Chrome or Microsoft Edge over HTTPS.";
      this.setStatus("error", msg);
      return false;
    }

    if (this.isConnected()) {
      return true;
    }

    this.setStatus("connecting");
    try {
      const serialApi = (navigator as unknown as { serial: { requestPort: (opts?: unknown) => Promise<SerialPortLike> } }).serial;
      // Prompt native browser USB / COM port selector dialog
      const port = await serialApi.requestPort();
      this.port = port;

      // Extract port info if available
      try {
        this.portInfo = port.getInfo ? port.getInfo() : null;
      } catch {
        this.portInfo = null;
      }

      // Open port at standard 115200 baud rate matching firmware
      await port.open({ baudRate: 115200 });

      this.setStatus("connected");
      this.lineBuffer = "";
      this.packetCount = 0;

      // Start continuous read loop
      this.startReading();

      // Start keepalive watchdog timer (sends heartbeat every 1000ms to prevent firmware watchdog timeout)
      this.startKeepalive();

      // Request initial status from ESP32
      this.send({ type: "toolhead.command", payload: { command: "PING" } });
      this.send({ type: "toolhead.command", payload: { command: "GET_STATE" } });

      console.log("[webSerial] Successfully connected to ESP32 USB COM port at 115200 baud.");
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to open USB Serial port.";
      console.warn("[webSerial] Connection failed or user canceled:", msg);
      await this.cleanup();
      this.setStatus("error", msg);
      return false;
    }
  }

  /**
   * Gracefully close USB port and release all reader locks.
   */
  public async disconnect(): Promise<void> {
    await this.cleanup();
    this.setStatus("disconnected");
  }

  private async cleanup(): Promise<void> {
    this.stopKeepalive();
    this.isReading = false;

    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch {
        // Ignored
      }
      try {
        this.reader.releaseLock();
      } catch {
        // Ignored
      }
      this.reader = null;
    }

    if (this.port) {
      try {
        await this.port.close();
      } catch (err) {
        console.warn("[webSerial] Error closing port:", err);
      }
      this.port = null;
    }

    this.lineBuffer = "";
    this.portInfo = null;
  }

  /**
   * Continuous read loop for incoming serial data.
   */
  private async startReading() {
    if (!this.port || !this.port.readable) return;
    this.isReading = true;

    try {
      this.reader = this.port.readable.getReader();
      while (this.isReading && this.port && this.port.readable) {
        const { value, done } = await this.reader.read();
        if (done) {
          break;
        }
        if (value) {
          this.processIncomingChunk(value);
        }
      }
    } catch (err: unknown) {
      if (this.isReading) {
        const msg = err instanceof Error ? err.message : "Serial read error";
        console.warn("[webSerial] Read loop interrupted:", msg);
        this.setStatus("error", msg);
      }
    } finally {
      if (this.reader) {
        try {
          this.reader.releaseLock();
        } catch {
          // Ignored
        }
        this.reader = null;
      }
    }
  }

  /**
   * Split incoming byte chunks on newline delimiters and dispatch valid JSON packets.
   */
  private processIncomingChunk(chunk: Uint8Array) {
    const text = this.textDecoder.decode(chunk, { stream: true });
    this.lineBuffer += text;

    const lines = this.lineBuffer.split("\n");
    // The last element is either an incomplete line or empty string
    this.lineBuffer = lines.pop() ?? "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // Handle raw boot string or non-JSON debugging logs from ESP32
      if (line.startsWith("TOOLHEAD_FIRMWARE_BOOT") || !line.startsWith("{")) {
        console.log("[webSerial:raw]", line);
        continue;
      }

      try {
        const packet = JSON.parse(line);
        if (packet && typeof packet.type === "string") {
          this.lastPacketReceivedAt = new Date().toISOString();
          this.packetCount++;
          this.packetHandlers.forEach((handler) => {
            try {
              handler(packet);
            } catch (err) {
              console.error("[webSerial] Packet handler error:", err);
            }
          });
        }
      } catch (parseErr) {
        console.warn("[webSerial] Corrupted JSON line received:", line, parseErr);
      }
    }
  }

  /**
   * Send a JSON command message to the ESP32 terminated by a newline.
   */
  public async send(message: Record<string, unknown>): Promise<boolean> {
    if (!this.port || !this.port.writable || this.status !== "connected") {
      return false;
    }

    try {
      const writer = this.port.writable.getWriter();
      const serialized = JSON.stringify(message) + "\n";
      const bytes = this.textEncoder.encode(serialized);
      await writer.write(bytes);
      writer.releaseLock();
      return true;
    } catch (err) {
      console.error("[webSerial] Write error:", err);
      this.setStatus("error", err instanceof Error ? err.message : "Failed to write command to USB Serial.");
      return false;
    }
  }

  /**
   * Keepalive watchdog timer sending a lightweight heartbeat every 1000ms.
   * Ensures the firmware's 2000ms watchdog does not trigger safeStop during active operations.
   */
  private startKeepalive() {
    this.stopKeepalive();
    this.keepaliveTimer = window.setInterval(() => {
      if (this.isConnected()) {
        this.send({ type: "heartbeat" });
      }
    }, 1000);
  }

  private stopKeepalive() {
    if (this.keepaliveTimer !== null) {
      window.clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }
}

export const webSerialService = new WebSerialService();
