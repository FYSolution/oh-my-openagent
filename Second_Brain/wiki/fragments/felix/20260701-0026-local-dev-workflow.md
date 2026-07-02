---
type: concept
target: local-dev-workflow
section: build-clean-deploy-sandbox
created: 2026-07-01T00:26
author: felix
action: replace
sources: [package.json, packages/omo-opencode/src/index.ts, Second_Brain/wiki/fragments/felix/20260701-0019-opencode-sandbox-load-lesson.md]
tags: [dev-workflow, build, deploy, sandbox, opencode, local-development, windows, testing]
---

# Local Development Guide — Build → Clean → Deploy to the OpenCode Sandbox

How to iterate on the oh-my-openagent plugin locally and run your changes inside the real
OpenCode binary on Windows. This is required because **OpenCode does NOT load the plugin from
your workspace** — it loads from its own managed cache sandbox (see "Why the sandbox" below).

## Key paths

| What             | Path                                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| Workspace root   | `C:\MyWorkplace\fy_solution\oh-my-openagent`                                                        |
| Plugin entry     | `packages/omo-opencode/src/index.ts`                                                                |
| Build output     | `dist/` (`index.js` + `cli/` + `skills/`)                                                           |
| OpenCode binary  | `C:\nvm4w\nodejs\node_modules\opencode-ai\bin\opencode.exe`                                         |
| **Load sandbox** | `C:\Users\<user>\.cache\opencode\packages\oh-my-openagent@latest\node_modules\oh-my-openagent\dist` |
| Plugin log       | `%TEMP%\oh-my-opencode.log`                                                                         |
| OpenCode config  | `C:\Users\<user>\.config\opencode\opencode.json` (plugin entry: plain `"oh-my-openagent"`)          |
| Plugin config    | `C:\Users\<user>\.config\opencode\oh-my-openagent.json`                                             |

## Why the sandbox (read this once)

OpenCode resolves the plugin from `~/.cache/opencode/packages/oh-my-openagent@latest/...`,
ignoring both a `file://` plugin spec and any `~/.config/opencode/node_modules` junction. So the
local loop is always: build in the workspace, then **copy `dist/` into that sandbox**.
Two gotchas:

1. `index.js` reads `dist/skills/*/SKILL.md` at import time — you MUST ship `dist/skills`, or the
   plugin silently fails to load (no log file, session falls back to the default "build" agent).
2. Copy the FULL `dist/` (`index.js` + `cli/` + `skills/`), not just `index.js`.

## The loop (PowerShell)

Run from the workspace root. Set a reusable variable for the sandbox once per shell:

```powershell
cd C:\MyWorkplace\fy_solution\oh-my-openagent
$sandbox = "C:\Users\$env:USERNAME\.cache\opencode\packages\oh-my-openagent@latest\node_modules\oh-my-openagent\dist"
```

### 1. Clean

```powershell
# Workspace build output
bun run clean            # rm -rf dist
# Old sandbox copy (so stale files never linger)
Remove-Item $sandbox -Recurse -Force -ErrorAction SilentlyContinue
```

### 2. Build

Fast path (plugin entry + skills only — enough to run OpenCode):

```powershell
bun build packages/omo-opencode/src/index.ts --outdir dist --target bun --format esm --external zod --external playwright-core
bun run build:shared-skills-assets   # copies packages/shared-skills/skills -> dist/skills (REQUIRED)
```

Full path (only when you changed the CLI, TUI, schema, MCP binaries, or codex plugin):

```powershell
bun run build            # git-bash-mcp + lsp-tools-mcp + lsp-daemon + codex-plugin + index + tui + skills + cli + schema
```

### 3. Verify the build imports (before deploying)

```powershell
bun -e "import('./dist/index.js').then(()=>console.log('IMPORT OK')).catch(e=>console.error('FAIL:',e.message))"
```

`FAIL: ENOENT ... dist/skills/...` means you skipped step 2's skills copy.

### 4. Deploy to the sandbox

```powershell
Copy-Item dist $sandbox -Recurse -Force
```

### 5. Run and confirm it loaded

```powershell
Remove-Item "$env:TEMP\oh-my-opencode.log" -Force -ErrorAction SilentlyContinue
$env:OPENCODE_DISABLE_AUTOUPDATE = "1"    # stop OpenCode re-fetching @latest over your copy
& "C:\nvm4w\nodejs\node_modules\opencode-ai\bin\opencode.exe" run "say hello"
```

Success signals:

- Session header shows `Sisyphus - ultraworker` (NOT `build`).
- `%TEMP%\oh-my-opencode.log` exists and contains `[tool-registry] Built tool registry`.

```powershell
Select-String "$env:TEMP\oh-my-opencode.log" -Pattern "Built tool registry" | ForEach-Object { $_.Line }
```

## Re-deploy after a code change (the inner loop)

After editing any `packages/omo-opencode/src/**` file, repeat only what changed:

```powershell
bun build packages/omo-opencode/src/index.ts --outdir dist --target bun --format esm --external zod --external playwright-core
# only if you touched shared-skills: bun run build:shared-skills-assets
Remove-Item $sandbox -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item dist $sandbox -Recurse -Force
Remove-Item "$env:TEMP\oh-my-opencode.log" -Force -ErrorAction SilentlyContinue
& "C:\nvm4w\nodejs\node_modules\opencode-ai\bin\opencode.exe" run "<your test prompt>"
```

## Clean up before committing

- Remove any scratch/debug files you created at the workspace root (e.g. `test-*.ts`).
- Strip debug `console.error` / temporary `log(...)` lines you added while diagnosing.
- Delete sentinel probes (e.g. `%TEMP%\omo-sentinel.txt`) and any `[SENTINEL]` code.
- `git status --short` — verify only intended files changed. `dist/` and `bun.lock` churn is
  expected from local builds; do not commit `dist/` changes unless the task requires it.
- Run `get_errors` / lint on touched files; the repo blocks `as any`, `@ts-ignore`, suppressed
  lint. Fix warnings in code you added (biome favors `replaceAll` + `RegExp.exec`).

## Troubleshooting

| Symptom                                    | Cause                                                                  | Fix                                                                  |
| ------------------------------------------ | ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Session shows `build` agent, no log file   | Plugin failed to import                                                | Verify import (step 3); usually missing `dist/skills`                |
| `ENOENT ... dist/skills/frontend/SKILL.md` | Skipped skills copy                                                    | `bun run build:shared-skills-assets` then redeploy                   |
| Changes not taking effect                  | Edited workspace but didn't redeploy, or OpenCode re-fetched `@latest` | Re-run steps 2+4; keep `OPENCODE_DISABLE_AUTOUPDATE=1`               |
| Old behavior persists                      | Stale files in sandbox                                                 | `Remove-Item $sandbox -Recurse -Force` before copy                   |
| `file://` plugin spec ignored              | OpenCode only loads from the cache sandbox                             | Use plain `"oh-my-openagent"` in opencode.json; copy dist to sandbox |

## Caveat

The sandbox copy is a manual override of the published `@latest`. If OpenCode updates or
re-installs the plugin, it overwrites your copy — just re-run the loop. Keep
`OPENCODE_DISABLE_AUTOUPDATE=1` in the shell you test from.
