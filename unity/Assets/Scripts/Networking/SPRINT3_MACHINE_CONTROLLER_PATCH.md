# Sprint 3 MachineController Minimal Patch

`MachineController.cs` is not present in this GitHub repository, so it could not be edited directly here.

Apply only the following minimal changes inside your existing Unity `MachineController.cs`.

## 1. Add State

Inside the `MachineController` class:

```csharp
public bool IsRunning { get; private set; }
```

## 2. Expose Existing Cycle

Add a public method that starts your existing machining coroutine.

Use the name of your existing coroutine in place of `MachiningCycleCoroutine()`:

```csharp
public void StartMachining()
{
    if (IsRunning)
    {
        return;
    }

    StartCoroutine(MachiningCycleCoroutine());
}
```

Do not rewrite tool movement, tank movement, spark logic, or cycle timing.

## 3. Wrap Existing Coroutine State

At the start of the existing machining coroutine:

```csharp
IsRunning = true;
```

At the end of the existing machining coroutine:

```csharp
IsRunning = false;

MachineManager machineManager = FindFirstObjectByType<MachineManager>();
if (machineManager != null)
{
    machineManager.NotifyMachiningFinished();
}
```

If your `MachineController.cs` is in the global namespace, add this at the top:

```csharp
using EDMDigitalTwin.Networking;
```

## Expected Sprint 3 Flow

```txt
React Start command
  -> Node gateway
  -> Unity WebSocketClient
  -> MachineManager.StartMachining()
  -> MachineController.StartMachining()
  -> existing machining coroutine
  -> MachineManager.NotifyMachiningFinished()
  -> unity.state idle
```
