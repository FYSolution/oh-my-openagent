---
type: decision
target: second-brain-runtime
section: architecture
created: 2026-07-01T12:15
author: felix
action: replace
last_verified: 2026-07-01
verified_commit: 11988a804
trust: curated
ttl_days: 180
code_anchors:
  [
    packages/omo-opencode/src/features/context-injector/collector.ts#L22-L41@f73dada2,
    packages/omo-opencode/src/plugin/session-compacting.ts#L38-L50@94bb9f79,
  ]
sources:
  [
    packages/omo-opencode/src/features/context-injector/collector.ts,
    packages/omo-opencode/src/plugin/session-compacting.ts,
    packages/omo-opencode/src/tools/session-manager/tools.ts,
    packages/omo-opencode/src/plugin/tool-registry-gated-tools.ts,
    Second_Brain/scripts/compile-wiki.ps1,
  ]
tags: [second-brain, runtime, memory, context-injection, tools, compaction, web-cache, design]
---

# Design: Second_Brain Runtime Bridges

Bring committed wiki memory into a live OpenCode session at runtime. The wiki
tooling (compile/search/freshness) is authoring-side PowerShell; this design is
the read-side, in-process TS that surfaces that memory to agents.

## Constraints (grounded, not assumed)

- The compiled index (`_manifest.json` + `index.md` + per-target pages) is an
  **essential** lookup layer, not something to avoid — you need an index to
  locate matching resources without re-scanning every fragment per query.
- `wiki/.compiled/` is **gitignored** (`Second_Brain/.gitignore`) — a fresh
  clone (or a different runtime environment) has no compiled output. So the
  runtime cannot _depend on it already existing_, but it CAN and SHOULD
  **regenerate it on demand**. Treat `.compiled/` as a regenerable cache with a
  stable contract, not a hard build artifact.
- OpenCode runs on macOS/Linux/Windows; **`pwsh` is not guaranteed** at runtime.
  So the runtime must regenerate the index **in TS**, not by shelling to the
  PowerShell scripts. pwsh (authoring) and TS (runtime) become two producers of
  the _same_ `.compiled/` contract.
- Read-through cache: on load, use `.compiled/` if present AND newer than every
  fragment (mtime check); otherwise regenerate the index in TS and (optionally,
  `second_brain.persist_index`, default on) write it back to `.compiled/` so the
  next process start and any other tool reuse it.
- The anchor hash must stay byte-for-byte identical to `anchor-hash.ps1`
  (SHA256, TrimEnd lines, LF join, UTF8, first 8 hex) so authoring and runtime
  agree. hashline-core's xxHash is unsuitable — a small dedicated hasher lives
  in `second-brain-core`, cross-checked against pwsh output in a test.
- The frontmatter parser MUST tolerate multiline flow arrays: markdown
  formatters reflow `code_anchors: [a, b]` across lines, which silently disabled
  drift tracking until the parser learned to merge continuation lines. Both the
  PowerShell and TS parsers merge continuations before parsing.
- Feature is OFF by default and a no-op when `<projectRoot>/Second_Brain/` is
  absent.

## Architecture

```
Second_Brain/wiki/fragments/{user}/*.md   (committed, source of truth)
            │
            ▼
packages/second-brain-core/  (pure TS — the runtime INDEX producer)
  ├─ fragment-parser     frontmatter + envelope (multiline-array tolerant)
  ├─ freshness           FRESH/AGING/STALE/DRIFTED/UNKNOWN + anchor hash
  ├─ indexer             target grouping + manifest  ── same contract as pwsh ──┐
  └─ search              keyword AND + relevance × freshness × trust           │
            │  read-through cache                                              ▼
            ├─ .compiled/ fresh (mtime)?  → read it            wiki/.compiled/ (regenerable
            └─ else regenerate in TS  → optionally persist ──▶  cache: index.md,
            │                                                   _manifest.json, pages)
            ▼  consumed by omo-opencode adapter
  ├─ tools: wiki_search, wiki_read          (gated: second_brain.enabled)
  ├─ ContextCollector source: "second-brain" (IntentGate-triggered injection)
  └─ compaction: pin relevant pages across compaction
```

## R1 — `packages/second-brain-core` (pure TS, no OpenCode dependency)

TS port of the parser/freshness/indexer/search already proven in
`compile-wiki.ps1`. It is the runtime **index producer**: it builds the same
`.compiled/` contract (manifest + per-target pages) pwsh builds, with a
read-through cache (use `.compiled/` when fresh by mtime, else regenerate and
optionally persist). Public API (draft): `loadIndex(root)` (read-through),
`rebuildIndex(root, { persist })`, `searchWiki(root, query, opts)`,
`readTarget(root, target)`, `computeAnchorHash(root, spec)`, `freshnessOf(frag)`.
Ships with a cross-tool test asserting `computeAnchorHash` == `anchor-hash.ps1`
AND that the TS-built `_manifest.json` matches the pwsh-built one for fixtures.
No OpenCode wiring → gate is `bun test`, not opencode-qa.

## R2 — `wiki_search` + `wiki_read` native tools

Read-only, modeled on `session-manager` tools (factory → `ToolDefinition`
record). Registered in `tool-registry-gated-tools.ts`, gated on
`second_brain.enabled`. `wiki_search(query, top?, folder?)` returns the ranked
table (with State badges); `wiki_read(target)` returns the in-memory compiled
page for a target. Both resolve `Second_Brain/` under `ctx.directory`.

## R3 — ContextCollector "second-brain" source

Add `"second-brain"` to `ContextSourceType` and register relevant wiki context
via `ContextCollector.register(sessionID, { source, id, content, priority })`.
Trigger: session start + IntentGate "what/how does X" queries → search wiki,
inject the top target page(s) at `priority: "low"` under a hard token cap
(`second_brain.max_inject_tokens`). Reuses the existing injection path
(chat.message / messages.transform) — no new injection mechanism.

## R4 — Compaction re-injection

Wire a `compactionContextInjector`-shaped object (capture/inject/restore) so the
wiki context pinned for a session survives compaction, using the existing
`CompactionHookDependencies` slot in `session-compacting.ts`. Capture the target
page identifiers at compaction start, re-emit their current compiled text into
`output.context` on inject (freshness recomputed, so stale pins are dropped).

## R5 — Web-cache (explicitly OUT of the committed wiki)

Scraped web content is per-user, volatile, license-encumbered — never committed.
A per-user on-disk cache under `.omo/web-cache/` (TTL-bound, `trust: source`)
optionally memoizes `web_search` results. Durable web-derived insight is
promoted by a human into a normal fragment with `trust: source` + short
`ttl_days`, never auto-written. Separate increment, separate config.

## Config (new schema `second_brain`, all optional, default off)

`enabled` (false), `path` (override `Second_Brain/`), `inject_on_session_start`
(false), `max_inject_tokens` (e.g. 1500), `search_default_top` (10),
`persist_index` (true — write the regenerated `.compiled/` cache back to disk).

## Increment order & QA gates

| Inc | Scope                         | QA gate                                 |
| --- | ----------------------------- | --------------------------------------- |
| R1  | second-brain-core (pure TS)   | `bun test` + pwsh cross-check           |
| R2  | wiki_search / wiki_read tools | opencode-qa (tool exec proof)           |
| R3  | ContextCollector source       | opencode-qa (chat.message inject proof) |
| R4  | compaction re-injection       | opencode-qa (session.compacting proof)  |
| R5  | web-cache                     | opencode-qa (isolated)                  |

R2–R5 touch `packages/omo-opencode/` → each ships via `work-with-pr` with
`opencode-qa` evidence under `.omo/evidence/`.

## Open questions

- Injection trigger precision: session-start always vs IntentGate-only? Start
  IntentGate-only to protect the token budget.
- Multi-user fragments: inject only the current user's + shared, or all? Default
  all (wiki is team-shared) but rank by freshness/trust so rot sinks.
- ~~Does `second-brain-core` re-emit the pwsh `_manifest.json` shape or a
  TS-native shape?~~ RESOLVED → **parity**: emit the same `.compiled/` contract
  so pwsh and TS are interchangeable index producers and the regenerated cache
  is reusable by both.
- Concurrent-writer safety: if pwsh and the runtime both regenerate `.compiled/`
  at once, writes must be atomic (temp file + rename) to avoid a torn index.
