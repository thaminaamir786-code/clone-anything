# Clone Anything - REA Web Workbench

A CLI-launched website that puts the **official REA (Reverse Engineer Anything)**
tools behind a browser UI. REA 6.10.1 is installed from npm (MIT licensed) and
runs locally; the website calls the real `rea` commands and displays the actual
Evidence, target source files and report.

This is **not** a generator that invents a different app. It records what REA
finds about the exact target you choose, and keeps the evidence, unknowns and
limitations visible.

## Legal scope

Authorized targets only. The workbench does not clone proprietary apps, copy
protected code, or remove real subscriptions, paywalls, license checks or DRM.

## Quick start

```powershell
cd "F:\Program Files\clone anything"
npm start
```

Open `http://127.0.0.1:3000`. Pick **Notes Example (real local target)** and
press **Run REA analysis**.

The source of truth lives in `C:\Users\USER\Documents\clone-anything`. Because
`F:\Program Files\clone anything` is admin-owned, use the elevated helper after
changes:

```powershell
# Run as administrator
powershell -ExecutionPolicy Bypass -File .\install-to-folder.ps1
```

## What the UI shows

- **Left:** target search (installed apps, folders, URLs), the installed REA
  tool catalog (206 tools), and the question for the agent.
- **Middle:** streamed tool events and the agent's reasoning.
- **Right:** four tabs — **Report**, **Evidence** (full REA JSON), **Target
  files** (read-only original source), and **Preview** (iframe for URLs).
- **Download bundle** exports `report.md`, `rea-evidence.json`, raw tool output
  and a snapshot of the target files.

## CLI

```powershell
npm start
npm run doctor
node bin/cli.js analyze <path|url> --question "..."
node bin/cli.js analyze builtin://notes-example
npm test
```

## Model settings

The website cannot embed a model by itself. By default it uses a deterministic
summarizer that reads the real REA Evidence. To use a stronger model, click
**Model** in the top bar and enter any OpenAI-compatible base URL, API key and
model name (for example `hy4`). Nothing is sent anywhere unless you configure
an endpoint.

Environment variables: `PORT`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`,
`BROWSER_CDP_URL`, `CLONE_ANYTHING_WORKSPACE`.

## REST API

`GET /api/status`, `GET /api/tools`, `GET/POST /api/model`, `POST /api/search`,
`POST /api/analyze`, `GET /api/job/:id`, `GET /api/download/:id`.

## License / attribution

MIT. REA is MIT-licensed by morluto — see `THIRD_PARTY_NOTICES.md`. No REA
source was copied into this repo; it is used as the installed npm package.
