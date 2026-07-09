# Integrated Digital Twin Test Checklist

## 1. Start Gateway

Command:

```bash
cd gateway
npm install
npm start
```

Expected result: the gateway listens on `ws://localhost:8080` and logs React/Unity client connections.

## 2. Start React

Command:

```bash
pnpm dev
```

Expected result: the dashboard opens, Simulation Mode still works, and Live Unity Mode shows `Connected` after the gateway is running.

## 3. Start Unity

Scene setup:

- Add `WebSocketClient` to a scene object.
- Add `MachineManager` and assign the existing `MachineController`.
- Add `MachineParameterManager`.
- Add `MachineTelemetryPublisher` and assign optional tool/tank transforms.
- Add `DashboardUI` and assign TextMeshPro fields.
- Add `CameraManager` and assign camera view transforms.

Expected result: Unity sends `client.hello` with role `unity`, then periodic `heartbeat` and `unity.state`.

## 4. Verify Parameters

Action: switch React to Live Unity Mode, edit Current/Voltage/Pulse values, and click Apply.

Expected result: React sends `machine.parameters.patch`, Unity updates `MachineParameters`, the Unity dashboard updates, and React receives matching telemetry.

## 5. Verify Machine Commands

Action: press Start, Stop, Reset, Home, Pause, Resume, and Emergency Stop from the React live command panel.

Expected result: commands travel through the gateway to Unity. Start calls `MachineController.StartMachining()` through `MachineManager`; other commands update machine state safely without changing existing animation logic.

## 6. Verify Telemetry

Action: watch Developer Diagnostics in React Settings.

Expected result: packet counts increase, reconnect count remains stable, last 20 messages show command/parameter/state traffic, and latency appears after gateway acknowledgements.

## 7. Verify Camera

Action: press Front, Top, Side, Tool, Iso, and Free.

Expected result: Unity camera moves to configured transforms. Free view leaves the camera untouched for manual scene navigation.

## 8. Verify Failure Recovery

Action: stop the gateway for 10 seconds, then start it again.

Expected result: React and Unity reconnect automatically. React shows `Disconnected` during outage and `Connected` after recovery.

## 9. Verify Production Build

Command:

```bash
pnpm build:github
```

Expected result: Vite builds without TypeScript errors and the GitHub Pages output is generated in `dist/`.
