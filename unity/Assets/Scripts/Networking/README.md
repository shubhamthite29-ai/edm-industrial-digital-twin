# Unity Networking Layer

Dependency-free Unity networking module for connecting Unity 6 to the Node.js WebSocket Gateway at:

```txt
ws://localhost:8080
```

## Files

```txt
Assets/Scripts/Networking/
  WebSocketClient.cs
  MessageModels.cs
  MachineManager.cs

Assets/Scripts/Machine/
  CameraManager.cs
  DashboardUI.cs
  MachineEvents.cs
  MachineParameterManager.cs
  MachineParameters.cs
  MachineState.cs
  MachineTelemetryPublisher.cs
```

## Dependency

No external package is required.

Do not install NativeWebSocket.

This implementation uses Unity/.NET built-in:

```txt
System.Net.WebSockets.ClientWebSocket
```

It is intended for Unity Editor and Standalone builds connecting to the local Node gateway.

## Scene Setup

1. Create an empty GameObject named `DigitalTwinNetworking`.
2. Add `WebSocketClient`.
3. Add `MachineManager`.
4. Add `MachineParameterManager`.
5. Add `MachineTelemetryPublisher`.
6. Assign your existing machine controller component to `MachineManager.machineController`.
7. Keep `Gateway Url` as `ws://localhost:8080`.
8. Start the Node gateway before pressing Play in Unity.

Your existing controller class may be named `Machinecontroller`, `MachineController`, or another MonoBehaviour name. `MachineManager` uses reflection and only requires that the assigned component has:

```csharp
StartMachining()
```

Optional:

```csharp
IsRunning
```

## Protocol

Unity sends on connection:

```json
{
  "type": "client.hello",
  "payload": {
    "role": "unity"
  }
}
```

React to Unity command:

```json
{
  "type": "machine.command",
  "payload": {
    "command": "start"
  }
}
```

React to Unity parameters:

```json
{
  "type": "machine.parameters.patch",
  "payload": {
    "currentA": 18,
    "voltageV": 90,
    "gapVoltageV": 72,
    "pulseOnUs": 150,
    "pulseOffUs": 45
  }
}
```

React to Unity camera:

```json
{
  "type": "camera.command",
  "payload": {
    "view": "front"
  }
}
```

Unity to React telemetry:

```json
{
  "type": "unity.state",
  "payload": {
    "status": "machining",
    "machineState": "MACHINING",
    "currentA": 18,
    "voltageV": 90,
    "gapVoltageV": 72,
    "cyclePercent": 25,
    "sparkActive": true
  }
}
```

## WebGL Note

Unity WebGL runs WebSockets through the browser JavaScript environment, not `ClientWebSocket`.

This dependency-free implementation compiles without NativeWebSocket and is for Editor/Standalone integration. During the WebGL sprint, keep the same protocol and add a small JavaScript bridge for WebGL builds.
