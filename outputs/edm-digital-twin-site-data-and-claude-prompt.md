# EDM Digital Twin Platform - Site Data and Claude AI Handoff

## Current Access URLs

- Local: http://127.0.0.1:5173/
- LAN: http://192.168.1.2:5173/
- Current Cloudflare public URL: https://christmas-mystery-read-packard.trycloudflare.com
- Latest verified Cloudflare URL file: `work/current-cloudflare-url.txt`

Note: Cloudflare Quick Tunnel URLs can rotate when the tunnel restarts. For permanent public access, deploy the `dist/` folder to Cloudflare Pages, Vercel, Netlify, or a real server.

## Project Stack

- React 19
- TypeScript
- Vite
- Tailwind CSS
- Zustand
- React Router
- React Three Fiber
- Three.js
- FBXLoader
- Recharts
- Lucide React
- Node static production server
- Cloudflare Quick Tunnel for public HTTPS access

## Main Source Files

- `src/app/App.tsx` - Main dashboard shell, sidebar modules, panels, controls, analytics, AI copilot, reports.
- `src/components/MachineScene.tsx` - 3D CAD model scene for EDM machine using FBX asset and animation.
- `src/components/MetricCard.tsx` - Engineering metric tiles.
- `src/components/Panel.tsx` - Industrial panel wrapper.
- `src/components/ParameterStepper.tsx` - Manual parameter input with up/down controls.
- `src/components/SensorDiagram.tsx` - SVG sensor placement diagram.
- `src/components/StatusPill.tsx` - Small status badges.
- `src/data/sensors.ts` - 19-sensor EDM sensor taxonomy.
- `src/services/edmCalculations.ts` - Physics and engineering calculation engine.
- `src/store/useTwinStore.ts` - Zustand digital twin state engine.
- `src/types/twin.ts` - Machine/twin TypeScript types.
- `src/types/sensor.ts` - Sensor TypeScript types.
- `server/static-server.mjs` - Stable production static server for `dist/`.

## 3D CAD Model

- Source CAD files found on `D:\`:
  - `D:\edm machine ZNC50.STEP`
  - `D:\edm(unity).fbx`
  - `D:\edm(unity2).fbx`
- Active web asset:
  - `public/models/edm-unity.fbx`
- Dashboard scene:
  - `src/components/MachineScene.tsx`

The dashboard now loads the provided FBX CAD model instead of the old handmade primitive spark model. It includes:

- Auto-centering and scaling using `Box3`.
- Slow inspection rotation.
- Small servo-like vertical motion tied to gap distance.
- Spark sphere animation tied to arc ratio.
- Thermal ring overlay tied to dielectric temperature.
- Translucent dielectric/sensor overlay.
- Fallback primitive model if FBX loading fails.
- On-screen `CAD MODEL ACTIVE` label.

## Core Dashboard Modules

Sidebar modules:

- Dashboard
- Live Machine
- Digital Twin
- Machine Control
- Simulation
- AI Copilot
- Engineering
- Predictions
- Analytics
- Maintenance
- Alarm Center
- Reports
- Settings
- Research Mode

Implemented dashboard surfaces:

- Live engineering metrics
- 3D EDM CAD digital twin
- Voltage and current charts
- Parameter control workflow
- What-if simulation
- Sensor fusion
- EDM AI Copilot
- Engineering equations
- Predictive maintenance
- Alarm center
- Analytics/report export
- Research batch simulation

## Digital Twin Parameters

Editable machining parameters:

- Voltage
- Current
- Pulse ON
- Pulse OFF
- Gap Distance
- Servo Feed
- Pressure
- Flow Rate
- Conductivity
- Open Circuit Voltage
- Depth of Cut
- Electrode Material
- Workpiece Material
- Machining Mode

Materials:

- Electrodes: Copper, Graphite, Brass Wire, Tungsten Copper
- Workpieces: H13 Steel, Titanium Ti-6Al-4V, Inconel 718, Tool Steel D2
- Modes: Die Sinking, Wire Cut, EDM Drilling

## Engineering Calculations

Implemented in `src/services/edmCalculations.ts`:

- Gap state classification
- Power
- Duty cycle
- Spark frequency
- Spark energy
- Material removal rate
- Tool wear rate
- Surface roughness
- Electrode wear ratio
- Heat generation
- Cooling rate
- Gap stability
- Energy consumption
- Machine efficiency
- Cycle time
- Remaining tool life
- Energy cost
- Carbon emissions
- OEE
- Machine health
- Prediction confidence
- Twin accuracy
- Dielectric temperature
- Cabinet temperature
- Vibration RMS
- Arc ratio

## Alarm Logic

Alarms implemented:

- Arc tendency
- Short-circuit risk
- Dielectric temperature over 30 degC
- Conductivity over 10 uS/cm in WEDM mode
- Low remaining tool life
- Vibration RMS over 3 g
- Cabinet temperature risk

## Sensor Data Model

19 sensors are modeled in `src/data/sensors.ts`.

Groups:

- Electrical
- Mechanical
- Dielectric
- Thermal
- Acoustic/Optical

MVP sensors:

- A1 Gap Voltage Probe
- A2 Discharge Current Sensor
- B1 Z-Axis Linear Encoder
- B2 Capacitive Gap Sensor
- C1 Dielectric Temperature RTD
- C2 Ultrasonic Flow Meter
- D1 Machine Bed Thermocouples

## Reliability Scripts

- `scripts/start-forever-server.ps1` - Restarts the local Node static server if it exits.
- `scripts/start-cloudflare-tunnel.ps1` - Restarts Cloudflare tunnel if it exits.
- `scripts/start-public-tunnel.ps1` - LocalTunnel fallback.
- `scripts/start-all.ps1` - Starts server and public tunnel watchdogs.
- `scripts/start-all.bat` - Double-click startup launcher.
- `scripts/register-startup-task.ps1` - Scheduled task installer, may require admin rights.
- Startup shortcut created:
  - `C:\Users\ShubhamShaurya\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\EDM Digital Twin Always On.lnk`

## Verification Status

Latest checks completed:

- `pnpm run build` passes.
- Local URL returns HTTP 200.
- Cloudflare public URL returns HTTP 200.
- FBX model is served at `/models/edm-unity.fbx`.
- Dashboard renders 10 sections.
- 3D canvas renders.
- Console error count: 0.
- Screenshot confirms CAD model is visible in the dashboard.

## Known Limitations

- The public Cloudflare Quick Tunnel URL can rotate after restart. Use Cloudflare Pages or a named Cloudflare Tunnel for a permanent URL.
- The app is currently frontend-only with simulated/live-derived digital twin values, not connected to physical EDM hardware.
- Bundle size is large because Three.js/Recharts are included in the main chunk. Code splitting is recommended later.
- If the laptop sleeps, shuts down, or loses internet, public access will stop until the machine wakes and the watchdog restarts.

## Claude AI Prompt

Paste this into Claude:

```text
You are a senior React/TypeScript, Three.js, industrial UI/UX, and manufacturing digital twin engineer.

You are working on an Industrial EDM Digital Twin Platform located in:

C:\Users\ShubhamShaurya\Documents\Codex\2026-07-05\absolutely-below-is-a-single-master-2

The app is a React 19 + TypeScript + Vite + Tailwind CSS dashboard for an Electric Discharge Machine digital twin. It uses Zustand, Recharts, Lucide React, React Three Fiber, Three.js, and FBXLoader.

Important files:

- src/app/App.tsx
- src/components/MachineScene.tsx
- src/data/sensors.ts
- src/services/edmCalculations.ts
- src/store/useTwinStore.ts
- src/types/twin.ts
- src/types/sensor.ts
- public/models/edm-unity.fbx
- server/static-server.mjs

Current app behavior:

- Dashboard first screen is an industrial control console, not a landing page.
- Sidebar modules include Dashboard, Live Machine, Digital Twin, Machine Control, Simulation, AI Copilot, Engineering, Predictions, Analytics, Maintenance, Alarm Center, Reports, Settings, and Research Mode.
- The 3D dashboard scene loads the provided EDM CAD model from public/models/edm-unity.fbx.
- The CAD scene auto-centers/scales the FBX model, slowly rotates it, adds small servo motion, and overlays animated spark and thermal effects driven by digital twin metrics.
- The digital twin calculation engine computes power, duty cycle, spark frequency, spark energy, MRR, surface roughness, electrode wear ratio, heat/cooling, energy, cost, emissions, OEE, health, confidence, and alarms.
- The app is served through a stable local Node static server and optionally exposed through Cloudflare Tunnel.

Your task:

Continue improving the dashboard without breaking existing functionality. Preserve the industrial/professional dark UI. Do not turn it into a marketing landing page. Treat the source documents and existing code as source of truth.

Priority improvements:

1. Improve the CAD scene in src/components/MachineScene.tsx:
   - Make the EDM CAD model framed beautifully in desktop and mobile viewports.
   - Add meaningful animations: servo Z-axis motion, spark intensity, heat zone, dielectric fluid glow, and slow operator-inspection rotation.
   - Keep animation linked to metrics from src/store/useTwinStore.ts and src/services/edmCalculations.ts.
   - Keep a fallback scene if the FBX fails to load.

2. Improve dashboard reliability:
   - Ensure pnpm run build and pnpm run typecheck pass.
   - Avoid runtime console errors.
   - Keep the static server scripts working.

3. Improve engineering realism:
   - Preserve deterministic calculations.
   - Do not add random unrelated values.
   - When one parameter changes, derived values should update consistently.

4. Improve UX:
   - Keep controls dense, professional, and operator-oriented.
   - No sliders for machining parameters.
   - Use manual numeric input plus up/down buttons.
   - Avoid text overlap and horizontal overflow on mobile.

Verification required before final answer:

- Run pnpm run build.
- Run pnpm run typecheck.
- Open http://127.0.0.1:5173/ or start scripts/start-all.bat.
- Verify CAD model renders in the 3D panel.
- Verify browser console has zero errors.
- Verify mobile width does not horizontally overflow.

Current public access:

- Cloudflare URL is written to work/current-cloudflare-url.txt.
- Local URL is http://127.0.0.1:5173/.

Do not delete the CAD asset. Do not replace the dashboard with a new unrelated app. Work incrementally and preserve the existing architecture.
```

