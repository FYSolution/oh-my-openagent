---
type: analysis
target: second-brain-runtime
section: r4-compaction-reinjection
created: 2026-07-01T17:05
author: felix
action: append
last_verified: 2026-07-01
trust: curated
ttl_days: 90
sources:
  [
    packages/omo-opencode/src/hooks/second-brain-injector/compaction.ts,
    packages/omo-opencode/src/hooks/second-brain-injector/pin-store.ts,
    packages/omo-opencode/src/hooks/second-brain-injector/hook.ts,
    packages/omo-opencode/src/plugin/session-compacting.ts,
    packages/omo-opencode/src/plugin/hooks/create-continuation-hooks.ts,
  ]
tags: [second-brain, runtime, r4, compaction, re-injection, pin-store, gating]
---

# R4: pin wiki context across compaction (status: implemented)

Fourth increment. The wiki page(s) auto-recalled during a session (R3) now
survive compaction: their identifiers are pinned, and the current compiled
text is re-emitted into the post-compaction context. OFF by default (gated on
`second_brain.enabled`), so zero blast radius.

## Shared pin store

`packages/omo-opencode/src/hooks/second-brain-injector/pin-store.ts` —
`SecondBrainPinStore` (session -> Set<target>) plus a process-level singleton
`secondBrainPinStore`, mirroring the `contextCollector` singleton pattern. It is
the shared channel between the R3 chat.message injector (writer) and the R4
compaction injector (reader), which are composed in different hook tiers
(transform vs continuation) and cannot pass state directly.

- R3 hook now takes an injectable `pinStore` (default singleton) and calls
  `pinStore.record(sessionID, target)` after registering context.

## Compaction injector

`packages/omo-opencode/src/hooks/second-brain-injector/compaction.ts` —
`createSecondBrainCompactionInjector(ctx, config, deps)` returns `{ inject
(sessionID) }`:

1. `pinStore.list(sessionID)` -> pinned targets (empty -> return "").
2. For each target, `readTarget(root, target)` re-reads the CURRENT compiled
   page (removed targets resolve to null and are dropped) under the same
   `max_inject_tokens` char budget.
3. Concatenate under a "pinned across compaction" header, or "" if nothing
   resolved.

`readTarget`/`pinStore` are dependency-injected for deterministic tests.

## Wiring

- `CompactionHookDependencies` (`session-compacting.ts`) gained an optional
  `secondBrainCompactionInjector?: { inject?(sessionID): string }` slot.
  `createSessionCompactingHandler` pushes its `inject` result into
  `output.context` right after the existing `compactionContextInjector` push —
  additive and guarded (only pushes when present and non-empty).
- `createContinuationHooks` builds `secondBrainCompactionInjector` via
  `safeCreateHook`, gated on `second_brain.enabled && inject_context !== false`,
  added to `ContinuationHooks` type + return. Flows through `CreatedHooks` into
  the `hooks` object passed to `createSessionCompactingHandler(hooks)`.

## Validation & remaining gate

12 unit tests green (pin store record/list/clear; injector re-emit / empty /
removed-target-drop / real-fixture read; R3 hook now asserts a pin was
recorded), no regressions in compaction/continuation/plugin-module suites (26
pass), tsgo clean.

`opencode-qa` (live proof pinned context reaches the post-compaction session)
remains the outstanding merge gate for R2 + R3 + R4 — it cannot run in the
Windows VS Code environment. `bun test` + `tsgo` is the local gate only.

## Known follow-up (minor)

`secondBrainPinStore` is not cleared on `session.deleted`, so the singleton map
grows by one small entry per session that triggered injection over a process
lifetime. Bounded and tiny (session id -> short target strings), off by default.
A `session.deleted` cleanup can be added if it ever matters.
