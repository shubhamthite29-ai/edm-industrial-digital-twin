# EDM Digital Twin Security Guide

## Public Website vs Private Source

The GitHub Pages site is intentionally public so professors, teammates, and presentation viewers can open the dashboard without GitHub access. Browser assets are always inspectable by visitors. Do not put secrets in React, Vite, Unity WebGL assets, or any `VITE_*` environment variable.

Keep private material in the source repository or private backend only:

- Backend source and deployment notes.
- Database configuration.
- API keys and service tokens.
- Machine, PLC, ESP32, or plant-network credentials.
- Certificates and private keys.
- Internal reports or generated implementation ZIPs.

## Repository Visibility

Make the repository private only after confirming the GitHub account plan supports the current Pages setup. GitHub Pages works from public repositories on GitHub Free. Pages from private repositories requires GitHub Pro, Team, Enterprise Cloud, or Enterprise Server.

If the account is on GitHub Free and changing the repository to private disables Pages, do not sacrifice the public presentation URL. Use one of these safer options:

- Upgrade to a plan that supports Pages from private repositories.
- Keep this public Pages repository as a deployment-only repository and move source/backend files into a separate private repository.
- Deploy the built `dist/` output to a static host that supports private source with public hosting.

## Current Deployment Decision Record

Current project deployment method:

- Source remote: `https://github.com/shubhamthite29-ai/edm-industrial-digital-twin.git`
- Public website: `https://shubhamthite29-ai.github.io/edm-industrial-digital-twin/`
- Publishing method: GitHub Actions workflow at `.github/workflows/deploy-pages.yml`
- Build command: `pnpm build:github`
- Published artifact folder: `dist`
- Unity WebGL public assets: `public/WebGL/Build/**`

Before changing repository visibility:

1. Open GitHub repository settings.
2. Confirm the account plan supports Pages from private repositories.
3. Confirm Pages is still set to deploy through GitHub Actions.
4. Create a rollback point by noting the latest working commit hash.
5. Change visibility only if GitHub confirms Pages will remain enabled.
6. After the visibility change, open the public website in a signed-out or incognito browser.
7. Verify the dashboard, Unity WebGL, START SOLVE, Simulation Mode, Dataset Mode, and Optimization Engine.

Do not proceed if GitHub warns that Pages will be disabled. In that case, keep the current Pages site public and move private source development into a separate private repository or a static host that supports private-source deployment.

## Environment Variables

Use `.env.example` as a template only. Real `.env` and `.env.*` files are ignored by Git.

Safe in `VITE_*`:

- Public API base URLs.
- Public WebSocket URLs such as `wss://...`.
- Public feature flags.

Never put in `VITE_*`:

- API keys.
- Database URLs with usernames or passwords.
- GitHub tokens.
- AWS, Azure, GCP, Firebase, or Supabase service-role keys.
- PLC, ESP32, gateway, or physical EDM credentials.

## Collaboration

Do not share passwords or personal access tokens. Add teammates as GitHub collaborators:

1. Open the repository on GitHub.
2. Go to `Settings`.
3. Open `Collaborators and teams`.
4. Click `Add people`.
5. Invite trusted teammates by GitHub username or email.
6. Give only the minimum role needed.

Use the public Pages URL for professors, friends, and viewers who only need to use the dashboard.

## Public Backend Rule

The public dashboard may control the virtual Unity WebGL twin in the viewer's browser. It must not directly expose physical EDM control.

Future physical machine control should use:

```text
Browser
  -> secure API / WSS
  -> private backend / edge gateway
  -> PLC / ESP32 / EDM machine
```

The browser must never connect directly to a database or physical-machine network.

## Pre-Publish Security Checklist

Before pushing:

- Run `rg -n -i "(api[_-]?key|secret|token|password|private[_-]?key|database_url|client_secret|bearer|ghp_|github_pat|sk-)"`.
- Confirm no `.env`, private keys, certs, local database files, or credential dumps are tracked.
- Confirm generated `outputs/` artifacts are not tracked. If needed, run `git rm --cached outputs/*` without deleting local files.
- Run `pnpm.cmd run typecheck`.
- Run `pnpm.cmd run build:github`.
- Confirm `dist/` does not contain `.map` files unless explicitly needed.
- Confirm GitHub Pages still serves the dashboard and Unity WebGL assets.

If a real secret is ever committed, rotate or revoke it immediately. Removing it from the latest commit is not enough because Git history may still expose it.
