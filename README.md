# Clone Anything - App Analysis & Reconstruction Workbench

A CLI-launched local web app that gives you a three-panel browser workbench:
**search a target on the left**, watch the **AI agent's thoughts in the middle**,
and inspect / download a **generated original project on the right**.

It is inspired by [REA (Reverse Engineer Anything)](https://github.com/morluto/rea)
but contains its own original implementation and no third-party npm packages.

## Legal scope (read this first)

This tool analyzes software **you own or are authorized to examine**. It
generates **original** implementations from observed evidence. It does **not**
clone proprietary apps or games, copy protected code, or remove real
subscriptions, paywalls, license checks or DRM. The only "subscription gate"
in the repository is a clearly marked **mock** gate inside the built-in demo,
and it is removed from the generated demo output to demonstrate that workflow.

## Requirements

- Node.js 22.23.4+, 24.22.1+, or 26.12.1+ (with npm)
- Any modern browser
- Optional: Chrome/Edge started with `--remote-debugging-port=9222` for live
  browser observation; otherwise the built-in HTTP observer is used
- Optional: an OpenAI-compatible API endpoint for a stronger reasoning model

## Quick start

```powershell
cd "C:\Users\USER\Documents\clone-anything"
npm start
```

The CLI starts a local server on `http://127.0.0.1:3000` and opens your browser.

Because `F:\Program Files\clone anything` is owned by Administrators, an
elevated helper script is included:

```powershell
# Run as administrator
powershell -ExecutionPolicy Bypass -File .\install-to-folder.ps1
```

## CLI commands

| Command | Purpose |
| --- | --- |
| `npm start` | Start the browser workbench |
| `node bin/cli.js start --port 4000 --no-open` | Custom port, no auto-open |
| `npm run doctor` | Check runtime, AI, browser and workspace |
| `node bin/cli.js analyze <path-or-url> --question "..."` | Analyze from the terminal |
| `npm test` | Run smoke tests |

## Configuration

Environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Local server port |
| `AI_BASE_URL` | empty | OpenAI-compatible API base URL, e.g. `https://api.openai.com/v1` |
| `AI_API_KEY` | empty | API key; when empty, the deterministic local brain is used |
| `AI_MODEL` | `gpt-4o-mini` | Model name for the configured endpoint |
| `BROWSER_CDP_URL` | `http://127.0.0.1:9222` | Chrome/Edge DevTools endpoint |

With no API key the workbench still works end to end using its local reasoning
engine. With a key, the same thought steps are produced by the configured model.

## Using the UI

1. Left panel: press **Search** to list installed apps plus the built-in demo,
   or type an absolute path / URL.
2. Select a target and edit the investigation question.
3. Press **Start analysis**.
4. Middle panel: follow the streamed thoughts and tool events.
5. Right panel: preview generated files, then press **Download ZIP**.

The built-in **Notes Example (built-in demo)** is the fastest way to see the
full pipeline, including the mock-gate cleanup step.

## REST API

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/status` | GET | Runtime and integration status |
| `/api/search` | POST | Discover targets from a query |
| `/api/analyze` | POST | Start a job; returns `{ id }` |
| `/api/job/:id` | GET | Job status, events and generated files |
| `/api/download/:id` | GET | Download the generated ZIP |

## How it works

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the pipeline and module map.

## License

MIT - see [LICENSE](LICENSE). REA attribution is in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
