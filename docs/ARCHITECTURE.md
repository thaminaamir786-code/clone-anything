# Architecture (v2 - REA web workbench)

```
bin/cli.js            CLI: start, doctor, analyze, help
src/server.js         Local HTTP server + REST API + static UI
src/rea.js            Wrapper around the installed official REA package
src/engine.js         Job pipeline: catalog -> REA analysis -> files -> report -> ZIP
src/brain.js          Model adapter + deterministic evidence summarizer
src/config.js         Paths, port, model settings, workspace in user profile
src/tools/browser.js  Website observation and optional CDP connection
src/tools/search.js   Local target discovery + built-in real sample
src/zip.js            Dependency-free ZIP writer
public/               Three-column browser UI
examples/notes-app/   Real local JavaScript target used by the built-in demo
```

## Pipeline

1. `prepare` - register an authorized target.
2. `tools` - load the live REA tool catalog (`rea --help`).
3. `analyze` - run `rea analyze-javascript-application` (or `rea analyze` /
   `rea analyze-web-bundle`) and keep the full Evidence JSON.
4. `files` - snapshot the original target files read-only.
5. `understand` - explain the Evidence with the configured model, or with the
   deterministic summarizer when no endpoint is configured.
6. `report` - build a report that preserves REA's limitations.
7. `export` - package report + full evidence + tool output + file snapshot.

## Key change from v1

v1 generated an unrelated "reconstruction". v2 never invents an app: it reports
the exact target REA inspected and lets you view the original source.
