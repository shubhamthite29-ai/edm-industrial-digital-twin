# EDM Digital Twin WebSocket Gateway

Sprint 1 gateway for forwarding real-time messages between the React dashboard and Unity 6 Editor.

```txt
React Dashboard
      <=>
Node.js WebSocket Gateway
      <=>
Unity 6 Editor
```

## Install

```powershell
cd gateway
npm install
```

## Run

```powershell
npm start
```

Default URL:

```txt
ws://localhost:8787
```

Optional environment variables:

```txt
HOST=0.0.0.0
PORT=8787
HEARTBEAT_INTERVAL_MS=30000
```

## Client Roles

Clients may identify themselves in either way:

```txt
ws://localhost:8787?role=react
ws://localhost:8787?role=unity
```

Or after connecting:

```json
{
  "type": "client.hello",
  "payload": {
    "role": "react"
  }
}
```

Supported roles:

```txt
react
unity
unknown
```

## Forwarding Rules

React to Unity:

```json
{
  "type": "machine.command",
  "payload": {
    "command": "start"
  }
}
```

Unity to React:

```json
{
  "type": "unity.state",
  "payload": {
    "status": "machining"
  }
}
```

Known routed message types:

```txt
machine.command             -> Unity
machine.parameters.patch    -> Unity
unity.state                 -> React
```

Unknown message types are forwarded to the opposite role by default.

## Message Envelope

The gateway accepts minimal messages and forwards them with a normalized envelope:

```json
{
  "schemaVersion": "1.0",
  "messageId": "uuid",
  "timestamp": "2026-07-09T12:00:00.000Z",
  "source": "react",
  "type": "machine.command",
  "payload": {
    "command": "start"
  }
}
```

## Heartbeat

The server uses WebSocket `ping` / `pong` to detect stale clients.

Clients can also send an application heartbeat:

```json
{
  "type": "heartbeat",
  "payload": {
    "status": "alive"
  }
}
```

The gateway replies with:

```json
{
  "type": "ack",
  "payload": {
    "status": "heartbeat"
  }
}
```

## Logging

Logs are written as JSON lines to stdout/stderr. This works locally and in production log collectors.

## Reconnect Handling

Reconnect is client-side behavior. The gateway supports reconnecting clients by:

- accepting repeated connections
- allowing role registration on every connection
- removing stale clients on failed heartbeat
- forwarding only to currently connected clients

React and Unity clients should reconnect with exponential backoff.
