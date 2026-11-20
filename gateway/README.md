# EDM Digital Twin WebSocket Gateway

Gateway for forwarding real-time messages between the React dashboard, Unity 6 Editor, and a calibration-locked physical Toolhead controller.

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
ws://localhost:8080
```

Optional environment variables:

```txt
HOST=0.0.0.0
PORT=8080
HEARTBEAT_INTERVAL_MS=30000
```

## Client Roles

Clients may identify themselves in either way:

```txt
ws://localhost:8080?role=react
ws://localhost:8080?role=unity
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
esp32 (direct ESP32 Wi-Fi controller or active USB serial bridge)
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
toolhead.command            -> ESP32 / active serial bridge
toolhead.set_position       -> ESP32 / active serial bridge
toolhead.set_speed          -> ESP32 / active serial bridge
toolhead.calibration        -> ESP32 / active serial bridge
toolhead.state              -> React, Unity
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

## USB serial Toolhead bridge

For the isolated ESP32 Toolhead controller, upload
`../firmware/toolhead_serial_controller_esp32_wroom32/toolhead_serial_controller_esp32_wroom32.ino` only after completing its physical calibration settings. Then use the root project launcher, which starts the gateway when needed and opens one explicit serial bridge:

```powershell
npm run toolhead:physical
```

It defaults to the current verified `COM6` / `115200` wiring and may be overridden without editing source:

```powershell
$env:TOOLHEAD_SERIAL_PORT = "COM6"
$env:TOOLHEAD_SERIAL_BAUD = "115200"
npm run toolhead:physical
```

To run only the bridge after starting the gateway yourself, set an explicit port in PowerShell:

```powershell
$env:TOOLHEAD_SERIAL_PORT = "COM_REPLACE_ME"
$env:TOOLHEAD_SERIAL_BAUD = "115200"
npm run serial:toolhead
```

The bridge opens the configured serial port first and only then registers as the existing `esp32` gateway role. When the serial port disconnects, it releases that role so the dashboard shows the physical controller as disconnected. The bridge sends serial heartbeat packets every 500 ms; the firmware stops an in-progress movement if these cease.

Do not start the bridge until the board, COM port, servo signal pin, physical travel, and safe servo angles have been measured. It does not upload firmware or set hardware values for you.
