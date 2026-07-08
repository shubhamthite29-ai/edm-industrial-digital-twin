# EDM Industrial Digital Twin Dashboard

Production-ready React + Three.js dashboard for an EDM digital twin with sensor fusion, physics calculations, CAD model visualization, alarms, analytics, maintenance views, reports, and AI copilot panels.

## Run Locally

```powershell
pnpm install
pnpm dev
```

Open `http://127.0.0.1:5173/`.

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
- `src/components/MachineScene.tsx` - Three.js EDM CAD model visualization
- `src/data/sensors.ts` - sensor catalog and telemetry metadata
- `src/services/edmCalculations.ts` - EDM physics and digital twin calculations
- `src/store/useTwinStore.ts` - live machine state store
- `server/static-server.mjs` - optional Node static production server
- `public/models/edm-unity.fbx` - EDM machine CAD model asset

## Deployment

For permanent public access, use GitHub Pages, Cloudflare Pages, Vercel, or Netlify. GitHub Pages is already configured through the included workflow.
