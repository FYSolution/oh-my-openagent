---
type: analysis
target: background-agent
section: fallback-honors-model-fallback-flag
created: 2026-07-30T17:30
author: felix
action: append
last_verified: 2026-07-30
trust: curated
ttl_days: 180
sources:
  [
    packages/omo-opencode/src/features/background-agent/manager.ts,
    packages/omo-opencode/src/features/background-agent/fallback-retry-handler.ts,
    packages/omo-opencode/src/create-managers.ts,
    packages/omo-opencode/src/features/background-agent/atlas-subagent-fallback-retry.test.ts,
    packages/omo-opencode/src/plugin/hooks/create-session-hooks.ts,
  ]
tags: [background-agent, fallback, model-fallback, config, retry, model-not-found]
---

# Background-agent fallback now honors an explicit `model_fallback: false`

## The gap

There are THREE independent fallback systems:

- `model-fallback` hook — proactive (chat.params), gated by `pluginConfig.model_fallback` (default off).
- `runtime-fallback` hook — reactive (session.error), gated by `pluginConfig.runtime_fallback.enabled` (default off).
- **background-agent `tryFallbackRetry`** — reactive retry for background/subagent tasks, driven by
  `task.fallbackChain`, gated by NEITHER flag. It was effectively always-on.

Symptom (single-custom-provider setup, `custom/qwen3.6-27b-fp8`, user had `model_fallback: false`
AND `runtime_fallback.enabled: false`): a context-overflow error on a background `explore` task
kicked off `tryFallbackRetry`, which walked the agent's HARDCODED default chain
(gpt-5.4-mini-fast → qwen3.5-plus → minimax → claude-haiku → gpt-5.4-nano …). None of those
providers exist in the user's setup, so every attempt failed `Model not found: <provider>/<model>`
— a 9-deep retry storm — before finally giving up. The user's explicit `model_fallback: false`
was ignored.

## Why not just gate on the flags for everyone?

`model_fallback` and `runtime_fallback.enabled` BOTH default to `false`/disabled, yet background
fallback has always worked by default. Gating the background path on `=== true` would silently
kill default fallback-on-error for every user. But `model_fallback` is `z.boolean().optional()`,
so **explicit `false`** (opt-in-to-disable) is distinguishable from **absent `undefined`** (default).

## Fix (2026-07-30)

Single choke point. `create-managers.ts` passes `disableModelFallback: pluginConfig.model_fallback === false`
into the `BackgroundManager`. The manager's `tryFallbackRetry` method (the wrapper all 5 fallback
sources route through — promptAsync.launch/resume, message.updated, session.status, session.error)
early-returns `false` when `disableModelFallback` is set:

```ts
private async tryFallbackRetry(task, errorInfo, source): Promise<boolean> {
  if (this.disableModelFallback) return false
  ...
}
```

Returning `false` makes callers fall through to normal error handling (task marked error with the
REAL error), so the storm never starts. Behavior is unchanged for users who leave `model_fallback`
unset (`undefined`) — only an explicit `false` disables background fallback.

## Boundaries / residual

- This does NOT touch the reachability gate in `fallback-retry-handler.ts`
  (`if (!connectedSet) return true`). When a user has NOT set `model_fallback: false` but their
  chain still lists unreachable providers, pruning depends on the connected-providers cache being
  populated; a cold/empty cache still fails open. Left as a separate, lower-priority gap.
- Test: `atlas-subagent-fallback-retry.test.ts` gained a case proving that with
  `disableModelFallback: true`, a retryable `usage_limit_reached` error creates NO fallback session
  (createdSessions stays 1, attemptCount 0). Suite: 4 pass. Manager suite: 199 pass.
