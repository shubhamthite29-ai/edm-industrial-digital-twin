import { SerialPort } from "serialport";
import { WebSocket } from "ws";
import { MESSAGE_TYPES, createEnvelope, parseJsonMessage, validateMessage } from "./protocol.js";

const serialPath = process.env.TOOLHEAD_SERIAL_PORT?.trim();
const baudRate = Number(process.env.TOOLHEAD_SERIAL_BAUD ?? 115200);
const gatewayUrl = process.env.GATEWAY_WS_URL ?? "ws://127.0.0.1:8080";
const heartbeatIntervalMs = Number(process.env.TOOLHEAD_SERIAL_HEARTBEAT_MS ?? 500);
const controllerName = process.env.TOOLHEAD_CONTROLLER_NAME?.trim() || "ESP32-WROOM-32";

if (!serialPath) {
  console.error("TOOLHEAD_SERIAL_PORT is required. The serial bridge will not start without an explicit port.");
  process.exit(1);
}

if (!Number.isInteger(baudRate) || baudRate <= 0 || !Number.isFinite(heartbeatIntervalMs) || heartbeatIntervalMs < 100) {
  console.error("TOOLHEAD_SERIAL_BAUD or TOOLHEAD_SERIAL_HEARTBEAT_MS is invalid.");
  process.exit(1);
}

function log(level, message, meta = {}) {
  const record = { timestamp: new Date().toISOString(), level, service: "toolhead-serial-bridge", message, ...meta };
  console[level === "error" ? "error" : "log"](JSON.stringify(record));
}

function gatewayUrlForController() {
  const url = new URL(gatewayUrl);
  url.searchParams.set("role", "esp32");
  return url.toString();
}

let socket = null;
let serialBuffer = "";
let stopped = false;
let reconnectTimer = null;
let heartbeatTimer = null;
let serialReconnectTimer = null;

const port = new SerialPort({ path: serialPath, baudRate, autoOpen: false });

function writeSerial(message) {
  if (!port.isOpen || !port.writable) return false;
  const line = `${JSON.stringify(message)}\n`;
  port.write(line, (writeError) => {
    if (writeError) {
      log("error", "Serial write failed.", { error: writeError.message });
    }
  });
  return true;
}

function sendGateway(message) {
  if (socket?.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(message));
  return true;
}

function sendHeartbeat() {
  writeSerial({ type: MESSAGE_TYPES.HEARTBEAT, payload: { status: "serial-bridge-alive" } });
}

function startHeartbeat() {
  if (heartbeatTimer !== null) return;
  heartbeatTimer = setInterval(sendHeartbeat, heartbeatIntervalMs);
}

function stopHeartbeat() {
  if (heartbeatTimer === null) return;
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

function scheduleGatewayReconnect() {
  if (stopped || reconnectTimer !== null || !port.isOpen) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectGateway();
  }, 2000);
}

function scheduleSerialReconnect() {
  if (stopped || serialReconnectTimer !== null || port.isOpen || port.opening) return;
  serialReconnectTimer = setTimeout(() => {
    serialReconnectTimer = null;
    openSerial();
  }, 2000);
}

function openSerial() {
  if (stopped || port.isOpen || port.opening) return;
  port.open((error) => {
    if (!error) return;
    log("error", "Unable to open configured serial controller port; retrying.", {
      serialPath,
      baudRate,
      error: error.message,
    });
    scheduleSerialReconnect();
  });
}

function connectGateway() {
  if (stopped || !port.isOpen || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
  socket = new WebSocket(gatewayUrlForController());

  socket.on("open", () => {
    log("info", "Gateway connected for active serial controller.", { gatewayUrl, serialPath, baudRate });
    sendGateway({ type: MESSAGE_TYPES.CLIENT_HELLO, payload: { role: "esp32", transport: "serial" } });
    startHeartbeat();
    // Safe idempotent probes: never command motion, but refresh telemetry after
    // a gateway reconnect or a board reset.
    writeSerial({ type: MESSAGE_TYPES.TOOLHEAD_COMMAND, payload: { command: "PING" } });
    writeSerial({ type: MESSAGE_TYPES.TOOLHEAD_COMMAND, payload: { command: "GET_STATE" } });
  });

  socket.on("message", (raw) => {
    const parsed = parseJsonMessage(raw);
    if (!parsed.ok || !validateMessage(parsed.message).ok) {
      log("error", "Gateway sent an invalid message.");
      return;
    }
    const message = parsed.message;
    if ([MESSAGE_TYPES.TOOLHEAD_COMMAND, MESSAGE_TYPES.TOOLHEAD_SET_POSITION, MESSAGE_TYPES.TOOLHEAD_SET_SPEED, MESSAGE_TYPES.TOOLHEAD_CALIBRATION].includes(message.type)) {
      log("info", "Forwarding command to ESP32 serial.", { type: message.type, payload: message.payload });
      const sent = writeSerial(message);
      if (!sent) log("error", "Toolhead command rejected because serial port is unavailable.", { type: message.type });
    }
  });

  socket.on("close", () => {
    stopHeartbeat();
    socket = null;
    log("info", "Gateway disconnected; serial controller will remain motion-safe.");
    scheduleGatewayReconnect();
  });

  socket.on("error", (error) => log("error", "Gateway socket error.", { error: error.message }));
}

function forwardSerialLine(line) {
  if (line === "TOOLHEAD_FIRMWARE_BOOT" || /^(controller|chip|protocol|baud)=/.test(line)) {
    log("info", "Controller boot diagnostic.", { serialPath, line });
    return;
  }

  const parsed = parseJsonMessage(line);
  if (!parsed.ok || !validateMessage(parsed.message).ok) {
    log("error", "Ignored malformed controller serial message.", { line: line.slice(0, 180) });
    return;
  }

  const message = parsed.message;
  if (message.type !== MESSAGE_TYPES.TOOLHEAD_STATE && message.type !== MESSAGE_TYPES.ERROR) {
    log("info", "Ignored unsupported controller serial message.", { type: message.type });
    return;
  }
  if (message.type === MESSAGE_TYPES.TOOLHEAD_STATE && (
    message.payload?.controller !== controllerName ||
    message.payload?.chip !== "ESP32-D0WD-V3" ||
    message.payload?.protocol !== "toolhead-json" ||
    !Number.isFinite(message.payload?.position_mm) ||
    !Number.isFinite(message.payload?.target_position_mm)
  )) {
    log("error", "Ignored invalid toolhead telemetry frame.", { serialPath });
    return;
  }
  const enriched = {
    ...message,
    payload: {
      ...message.payload,
      port: serialPath,
      transport: "usb_serial",
    },
  };
  const ok = sendGateway(createEnvelope(enriched, { role: "esp32" }));
  if (!ok) log("error", "Telemetry frame could not be forwarded — gateway socket not open.", { serialPath });
}

port.on("open", () => {
  log("info", "Serial controller port opened.", { serialPath, baudRate });
  // connectGateway() will send PING + GET_STATE once the WebSocket is ready.
  // Sending probes here would be discarded: the gateway socket is not yet open.
  connectGateway();
});

port.on("data", (data) => {
  serialBuffer += data.toString("utf8");
  let newline = serialBuffer.indexOf("\n");
  while (newline >= 0) {
    const line = serialBuffer.slice(0, newline).trim();
    serialBuffer = serialBuffer.slice(newline + 1);
    if (line) forwardSerialLine(line);
    newline = serialBuffer.indexOf("\n");
  }
  if (serialBuffer.length > 4096) {
    serialBuffer = "";
    log("error", "Serial receive buffer reset after exceeding safety limit.");
  }
});

port.on("close", () => {
  stopHeartbeat();
  // Reset write queue and RX buffer so the next connection starts clean.
  writeQueue = Promise.resolve();
  serialBuffer = "";
  if (socket) socket.close();
  socket = null;
  log("error", "Serial controller disconnected. Gateway role will be removed.", { serialPath });
  scheduleSerialReconnect();
});

port.on("error", (error) => {
  log("error", "Serial port error.", { error: error.message, serialPath });
  scheduleSerialReconnect();
});

function shutdown(signal) {
  stopped = true;
  stopHeartbeat();
  if (reconnectTimer !== null) clearTimeout(reconnectTimer);
  if (serialReconnectTimer !== null) clearTimeout(serialReconnectTimer);
  writeSerial({ type: MESSAGE_TYPES.TOOLHEAD_COMMAND, payload: { command: "STOP" } });
  if (socket) socket.close();
  if (port.isOpen) port.close();
  log("info", "Toolhead serial bridge stopped.", { signal });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

openSerial();
