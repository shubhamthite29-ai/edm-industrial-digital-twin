import { randomUUID } from "node:crypto";

export const CLIENT_ROLES = {
  REACT: "react",
  UNITY: "unity",
  UNKNOWN: "unknown",
};

export const MESSAGE_TYPES = {
  CLIENT_HELLO: "client.hello",
  HEARTBEAT: "heartbeat",
  ACK: "ack",
  ERROR: "error",
  CLIENT_STATUS: "client.status",
  GATEWAY_STATUS: "gateway.status",
  MACHINE_COMMAND: "machine.command",
  MACHINE_PARAMETERS_PATCH: "machine.parameters.patch",
  CAMERA_COMMAND: "camera.command",
  UNITY_STATE: "unity.state",
};

const ROUTES = {
  [MESSAGE_TYPES.MACHINE_COMMAND]: [CLIENT_ROLES.UNITY],
  [MESSAGE_TYPES.MACHINE_PARAMETERS_PATCH]: [CLIENT_ROLES.UNITY],
  [MESSAGE_TYPES.CAMERA_COMMAND]: [CLIENT_ROLES.UNITY],
  [MESSAGE_TYPES.UNITY_STATE]: [CLIENT_ROLES.REACT],
};

export function parseJsonMessage(rawMessage) {
  const text = Buffer.isBuffer(rawMessage) ? rawMessage.toString("utf8") : String(rawMessage);

  try {
    return { ok: true, message: JSON.parse(text) };
  } catch {
    return { ok: false, error: "Invalid JSON payload." };
  }
}

export function validateMessage(message) {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return { ok: false, error: "Message must be a JSON object." };
  }

  if (typeof message.type !== "string" || message.type.length === 0) {
    return { ok: false, error: "Message requires a non-empty string type." };
  }

  if (message.payload !== undefined && (typeof message.payload !== "object" || message.payload === null || Array.isArray(message.payload))) {
    return { ok: false, error: "Message payload must be an object when provided." };
  }

  return { ok: true };
}

export function createEnvelope(message, client) {
  return {
    schemaVersion: message.schemaVersion ?? "1.0",
    messageId: message.messageId ?? randomUUID(),
    timestamp: message.timestamp ?? new Date().toISOString(),
    source: message.source ?? client.role,
    type: message.type,
    payload: message.payload ?? {},
  };
}

export function getRoleFromRequest(requestUrl) {
  const url = new URL(requestUrl, "ws://localhost");
  const role = url.searchParams.get("role")?.toLowerCase();

  if (role === CLIENT_ROLES.REACT) return CLIENT_ROLES.REACT;
  if (role === CLIENT_ROLES.UNITY) return CLIENT_ROLES.UNITY;
  return CLIENT_ROLES.UNKNOWN;
}

export function getRoleFromHello(message) {
  const role = message.payload?.role?.toLowerCase();

  if (role === CLIENT_ROLES.REACT) return CLIENT_ROLES.REACT;
  if (role === CLIENT_ROLES.UNITY) return CLIENT_ROLES.UNITY;
  return null;
}

export function getForwardTargets(messageType, sourceRole) {
  const explicitTargets = ROUTES[messageType];
  if (explicitTargets) return explicitTargets;

  if (sourceRole === CLIENT_ROLES.REACT) return [CLIENT_ROLES.UNITY];
  if (sourceRole === CLIENT_ROLES.UNITY) return [CLIENT_ROLES.REACT];
  return [CLIENT_ROLES.REACT, CLIENT_ROLES.UNITY];
}

export function createAck(messageId, status = "accepted") {
  return {
    schemaVersion: "1.0",
    messageId: randomUUID(),
    timestamp: new Date().toISOString(),
    source: "gateway",
    type: MESSAGE_TYPES.ACK,
    payload: {
      messageId,
      status,
    },
  };
}

export function createError(code, detail, messageId = null) {
  return {
    schemaVersion: "1.0",
    messageId: randomUUID(),
    timestamp: new Date().toISOString(),
    source: "gateway",
    type: MESSAGE_TYPES.ERROR,
    payload: {
      messageId,
      code,
      detail,
    },
  };
}
