# Unity Networking Layer

Sprint 2 networking-only module for connecting Unity 6 to the Sprint 1 Node.js WebSocket Gateway.

## Files

```txt
Assets/Scripts/Networking/
  WebSocketClient.cs
  MessageModels.cs
  MachineManager.cs
Assets/Scripts/Machine/
  MachineParameters.cs
  MachineParameterManager.cs
```

## Dependency

Install NativeWebSocket in Unity Package Manager.

Recommended Git URL:

```txt
https://github.com/endel/NativeWebSocket.git#upm
```

## Scene Setup

1. Create an empty GameObject named `DigitalTwinNetworking`.
2. Add `WebSocketClient`.
3. Add `MachineManager` to the same GameObject or assign an existing `MachineManager` reference.
4. Add `MachineParameterManager` to the same GameObject or assign an existing `MachineParameterManager` reference.
5. Set `Gateway Url`.

Default:

```txt
ws://localhost:8080
```

The Sprint 1 gateway and this Unity client now both default to `8080`.

## Behavior

On connection Unity sends:

```json
{
  "type": "client.hello",
  "payload": {
    "role": "unity"
  }
}
```

When Unity receives:

```json
{
  "type": "machine.command",
  "payload": {
    "command": "start"
  }
}
```

it calls:

```csharp
MachineManager.StartMachining();
```

For Sprint 3, `StartMachining()` calls:

```csharp
machineController.StartMachining();
```

It also sends:

```json
{
  "type": "unity.state",
  "payload": {
    "status": "machining"
  }
}
```

When the existing machining coroutine finishes, call:

```csharp
machineManager.NotifyMachiningFinished();
```

That sends:

```json
{
  "type": "unity.state",
  "payload": {
    "status": "idle"
  }
}
```

No existing machine animation, spark, tank, or tool behavior should be changed.

## Parameter Synchronization

When Unity receives:

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

`WebSocketClient` forwards the packet to `MachineParameterManager`, which updates the shared `MachineParameters` object.

Other Unity scripts should read from `MachineParameterManager.Current` instead of reading WebSocket messages directly.
