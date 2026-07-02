---
type: lesson
target: local-plugin-testing
section: opencode-sandbox-load-path
created: 2026-07-01T00:19
author: felix
action: append
sources: [packages/omo-opencode/src/index.ts, package.json]
tags: [opencode, plugin-loading, testing, windows, sandbox, dev-workflow]
---

# Lesson: OpenCode loads the plugin from its own cache sandbox, not your junction

## Symptom

Local edits to the plugin appear to have no effect when running `opencode run`; the session
shows the default "build" agent instead of "Sisyphus - ultraworker", and no plugin log is
written to `%TEMP%\oh-my-opencode.log`.

## Root cause

The OpenCode binary loads oh-my-openagent ONLY from its managed sandbox:

```
~/.cache/opencode/packages/oh-my-openagent@latest/node_modules/oh-my-openagent/dist/
```

(Windows: `C:\Users\<user>\.cache\opencode\packages\...`). It **ignores** both:

- a `file://<abs-path>` entry in `opencode.json` `plugin[]`, and
- a junction at `~/.config/opencode/node_modules/oh-my-openagent` -> workspace.

The working `opencode.json` plugin entry is the plain name: `"oh-my-openagent"`.

## Second trap: skills must be present at import time

`dist/index.js` reads `dist/skills/*/SKILL.md` synchronously during module import. A bare
`bun build packages/omo-opencode/src/index.ts` produces only `index.js` — importing it then
throws `ENOENT ... dist/skills/frontend/SKILL.md`, and OpenCode **silently** drops the plugin
(no log file at all, falls back to "build" agent).

## Repeatable local-test recipe (Windows)

1. `bun build packages/omo-opencode/src/index.ts --outdir dist --target bun --format esm --external zod --external playwright-core`
2. `bun run build:shared-skills-assets` (copies `packages/shared-skills/skills` -> `dist/skills`)
3. Verify: `bun -e "import('./dist/index.js').then(()=>console.log('OK')).catch(e=>console.error(e.message))"`
4. Copy the FULL dist (index.js + cli/ + skills/) into the sandbox `.../oh-my-openagent/dist/` (recurse, force).
5. `& opencode.exe run "..."` — success shows the Sisyphus agent and writes the log with
   `[tool-registry] Built tool registry`.

## Signal of success vs failure

- Log file exists + `Built tool registry` line = plugin loaded.
- No log file = import threw (usually missing `dist/skills` or another missing dist file).
