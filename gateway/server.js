import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import {
  CLIENT_ROLES,
  MESSAGE_TYPES,
  createAck,
  createEnvelope,
  createError,
  getForwardTargets,
  getRoleFromHello,
  getRoleFromRequest,
  parseJsonMessage,
  validateMessage,
} from "./protocol.js";

const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 8080);
const heartbeatIntervalMs = Number(process.env.HEARTBEAT_INTERVAL_MS ?? 30000);

const clients = new Map();
const server = createServer();
const wss = new WebSocketServer({ server });

function log(level, message, meta = {}) {
  const record = {
    timestamp: new Date().toISOString(),
    level,
    service: "edm-digital-twin-gateway",
    message,
    ...meta,
  };
  console[level === "error" ? "error" : "log"](JSON.stringify(record));
}

function send(client, message) {
  if (client.socket.readyState !== WebSocket.OPEN) return false;
  client.socket.send(JSON.stringify(message));
  return true;
}

function countByRole(role) {
  return Array.from(clients.values()).filter((client) => client.role === role).length;
}

function broadcast(message, targetRoles, senderId) {
  let delivered = 0;

  for (const client of clients.values()) {
    if (client.id === senderId) continue;
    if (!targetRoles.includes(client.role)) continue;
    if (send(client, message)) delivered += 1;
  }

  return delivered;
}

function registerClient(socket, request) {
  const id = randomUUID();
  const client = {
    id,
    socket,
    role: getRoleFromRequest(request.url),
    connectedAt: new Date(),
    lastSeenAt: new Date(),
    alive: true,
  };

  clients.set(id, client);

  log("info", "Client connected.", {
    clientId: id,
    role: client.role,
    reactClients: countByRole(CLIENT_ROLES.REACT),
    unityClients: countByRole(CLIENT_ROLES.UNITY),
  });

  send(client, {
    schemaVersion: "1.0",
    messageId: randomUUID(),
    timestamp: new Date().toISOString(),
    source: "gateway",
    type: MESSAGE_TYPES.ACK,
    payload: {
      status: "connected",
      clientId: id,
      role: client.role,
    },
  });

  socket.on("pong", () => {
    client.alive = true;
    client.lastSeenAt = new Date();
  });

  socket.on("message", (rawMessage) => handleMessage(client, rawMessage));

  socket.on("close", (code, reason) => {
    clients.delete(id);
    log("info", "Client disconnected.", {
      clientId: id,
      role: client.role,
      code,
      reason: reason.toString("utf8"),
      reactClients: countByRole(CLIENT_ROLES.REACT),
      unityClients: countByRole(CLIENT_ROLES.UNITY),
    });
  });

  socket.on("error", (error) => {
    log("error", "Client socket error.", {
      clientId: id,
      role: client.role,
      error: error.message,
    });
  });
}

function handleMessage(client, rawMessage) {
  client.lastSeenAt = new Date();

  const parsed = parseJsonMessage(rawMessage);
  if (!parsed.ok) {
    send(client, createError("INVALID_JSON", parsed.error));
    return;
  }

  const validation = validateMessage(parsed.message);
  if (!validation.ok) {
    send(client, createError("INVALID_MESSAGE", validation.error, parsed.message?.messageId));
    return;
  }

  if (parsed.message.type === MESSAGE_TYPES.CLIENT_HELLO) {
    const role = getRoleFromHello(parsed.message);
    if (role) client.role = role;
    send(client, createAck(parsed.message.messageId, "registered"));
    log("info", "Client registered role.", { clientId: client.id, role: client.role });
    return;
  }

  if (parsed.message.type === MESSAGE_TYPES.HEARTBEAT) {
    send(client, createAck(parsed.message.messageId, "heartbeat"));
    return;
  }

  const envelope = createEnvelope(parsed.message, client);
  const targetRoles = getForwardTargets(envelope.type, client.role);
  const delivered = broadcast(envelope, targetRoles, client.id);

  send(client, createAck(envelope.messageId, delivered > 0 ? "forwarded" : "no_target_connected"));

  log("info", "Message forwarded.", {
    messageId: envelope.messageId,
    type: envelope.type,
    sourceRole: client.role,
    targetRoles,
    delivered,
  });
}

const heartbeatTimer = setInterval(() => {
  for (const client of clients.values()) {
    if (!client.alive) {
      log("info", "Terminating stale client.", { clientId: client.id, role: client.role });
      client.socket.terminate();
      clients.delete(client.id);
      continue;
    }

    client.alive = false;
    client.socket.ping();
  }
}, heartbeatIntervalMs);

wss.on("connection", registerClient);

wss.on("error", (error) => {
  log("error", "WebSocket server error.", { error: error.message });
});

server.listen(port, host, () => {
  log("info", "Gateway listening.", {
    url: `ws://${host}:${port}`,
    heartbeatIntervalMs,
  });
});

function shutdown(signal) {
  log("info", "Gateway shutting down.", { signal });
  clearInterval(heartbeatTimer);

  for (const client of clients.values()) {
    client.socket.close(1001, "Gateway shutting down.");
  }

  wss.close(() => {
    server.close(() => {
      log("info", "Gateway stopped.");
      process.exit(0);
    });
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
