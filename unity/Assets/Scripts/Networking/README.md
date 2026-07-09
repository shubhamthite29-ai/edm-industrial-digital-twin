# Unity Networking Layer

Sprint 2 networking-only module for connecting Unity 6 to the Sprint 1 Node.js WebSocket Gateway.

## Files

```txt
Assets/Scripts/Networking/
  WebSocketClient.cs
  MessageModels.cs
  MachineManager.cs
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
4. Set `Gateway Url`.

Default:

```txt
ws://localhost:8080
```

The Sprint 1 gateway currently defaults to `8787`, so either:

```powershell
$env:PORT=8080
npm start
```

or set Unity's `Gateway Url` to:

```txt
ws://localhost:8787
```

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

For Sprint 2, `StartMachining()` only logs:

```txt
Machine cycle started
```

No existing machine animation, spark, tank, or tool scripts are modified.
