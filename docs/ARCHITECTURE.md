# Architecture

```
bin/cli.js            CLI entry point: start, doctor, analyze, help
src/server.js         Local HTTP server + REST API + static UI
src/config.js         Paths, port, AI and browser configuration (workspace in user profile)
src/utils.js          Browser opening, delays, slugs, escaping
src/engine.js         Job lifecycle, thought streaming, orchestration
src/brain.js          AI reasoning core (configurable provider + local fallback)
src/generator.js      Original project generation + mock-gate cleanup (demo only)
src/zip.js            Dependency-free ZIP writer (DEFLATE, UTF-8, CRC32)
src/tools/search.js   Local app discovery (Windows registry + folders + demo)
src/tools/fsanalyze.js  Static analysis of files and folders
src/tools/browser.js  HTTP observation and optional Chrome DevTools Protocol
public/               Three-column browser UI (search / thoughts / workspace)
tests/                Node test-runner smoke tests
```

## Job pipeline

1. `prepare` - register an authorized analysis job.
2. `inspect` - resolve the target (demo, local path, or URL).
3. `read` - extract modules, functions, routes, IPC handlers and hints.
4. `understand` - use the browser tool when the target is a website.
5. `reconstruct` - generate an original MIT-licensed project.
6. `normalize` - for the built-in demo only, remove the mock subscription
   scaffolding from the generated copy. No real paywall or DRM is touched.
7. `verify` - syntax-check generated JavaScript.
8. `export` - write a downloadable ZIP.

## Design rules

- No runtime npm dependencies; Node.js built-ins only.
- Everything runs locally unless you explicitly configure an AI API endpoint.
- Generated code is original; target source is never copied.
- Legal scope is enforced in prompts, UI and generated README files.
