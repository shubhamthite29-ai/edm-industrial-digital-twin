# EDM Industrial Digital Twin Platform v1.0

Production-ready React + Three.js + Unity + Node WebSocket platform for an EDM industrial digital twin. The React dashboard is the master HMI, the Node gateway routes JSON messages, and Unity runs the live digital twin visualization.

## Version 1.0 Capabilities

- React dashboard controls Unity through `ws://localhost:8080`
- Unity publishes live telemetry back to the dashboard
- Continuous machining until Stop or Emergency Stop
- Start, Stop, Pause, Resume, Home, Reset, and Emergency Stop commands
- Current, Voltage, Gap Voltage, Pulse ON, and Pulse OFF synchronization
- Synchronized machine state, progress, elapsed time, and remaining time
- Camera commands: Front, Side, Top, Isometric
- Persistent machine settings after restart
- Industrial event log, alarm history, notifications, and diagnostics
- One-click Windows startup and shutdown scripts

## Run Locally

```powershell
pnpm install
pnpm dev
```

Open `http://127.0.0.1:5173/`.

## One-Click Demo Startup

Use:

```powershell
Start_EDM_DigitalTwin.bat
```

This starts:

- Node WebSocket Gateway on `ws://localhost:8080`
- Vite dashboard on `http://127.0.0.1:5173/`
- Browser window after readiness checks

Then open Unity and press Play. The dashboard will show Unity connection and telemetry in Live Unity Mode.

To stop the gateway and dashboard:

```powershell
Stop_EDM_DigitalTwin.bat
```

## Build

```powershell
pnpm build
```

## GitHub Pages Build

```powershell
pnpm build:github
```

The repository includes a GitHub Actions workflow at `.github/workflows/deploy-pages.yml` that deploys the dashboard to GitHub Pages after every push to `main`.

## Main Code Areas

- `src/app/App.tsx` - dashboard application shell and pages
- `src/Realtime/RealtimeClient.ts` - browser WebSocket client with reconnect, heartbeat, latency, and logs
- `src/Machine/` - machine command, camera, and parameter services
- `src/components/MachineScene.tsx` - Three.js EDM CAD model visualization
- `src/data/sensors.ts` - sensor catalog and telemetry metadata
- `src/services/edmCalculations.ts` - EDM physics and digital twin calculations
- `src/store/useTwinStore.ts` - live machine state store
- `gateway/` - Node.js WebSocket gateway
- `unity/Assets/Scripts/` - Unity networking, machine state, telemetry, dashboard, and camera scripts
- `server/static-server.mjs` - optional Node static production server
- `public/models/edm-unity.fbx` - EDM machine CAD model asset

## Unity Setup

Copy the contents of:

```text
unity/Assets/Scripts
```

into your Unity project under:

```text
Assets/Scripts
```

Add these components to a scene object:

- `WebSocketClient`
- `MachineManager`
- `MachineParameterManager`
- `MachineTelemetryPublisher`
- Optional: `DashboardUI`
- Optional: `CameraManager`

Assign your existing machine controller MonoBehaviour to `MachineManager.machineController`. The integration calls `StartMachining()` if that method exists and keeps its own synchronized V1 state model for commands and telemetry.

The Unity networking layer does not require NativeWebSocket or any Git package.

## Deployment

For permanent public access, use GitHub Pages, Cloudflare Pages, Vercel, or Netlify. GitHub Pages is already configured through the included workflow.

## Verification

Use [outputs/v1.0-testing-checklist.md](outputs/v1.0-testing-checklist.md) before demonstrations.
