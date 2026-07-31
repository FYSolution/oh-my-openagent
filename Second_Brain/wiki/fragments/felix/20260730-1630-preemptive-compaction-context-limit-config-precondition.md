---
type: analysis
target: preemptive-compaction
section: context-limit-config-precondition
created: 2026-07-30T16:30
author: felix
action: append
last_verified: 2026-07-30
trust: curated
ttl_days: 180
sources:
  [
    packages/omo-opencode/src/plugin-handlers/provider-config-handler.ts,
    packages/model-core/src/context-limit-resolver.ts,
    packages/omo-opencode/src/hooks/preemptive-compaction-trigger.ts,
    packages/omo-opencode/src/features/background-agent/fallback-retry-handler.ts,
  ]
tags: [context-limit, compaction, config, custom-provider, model-limit, fallback, background-agent]
---

# Preemptive compaction silently no-ops when a model has no declared context limit

## The precondition nobody documents

`resolveActualContextLimit(providerID, modelID)` for a **non-Anthropic** provider
returns ONLY `modelCacheState.modelContextLimitsCache.get(\`${providerID}/${modelID}\`)`,
and that cache is populated in `provider-config-handler.ts` `applyProviderConfig()`EXCLUSIVELY from each model's`limit.context` in the opencode provider config:

```ts
const contextLimit = modelConfig?.limit?.context;
if (!contextLimit) continue; // ← no entry cached when limit.context is absent
modelContextLimitsCache.set(`${providerID}/${modelID}`, contextLimit);
```

There is NO fallback to models.dev / runtime metadata for the context window on the
non-Anthropic path. So a custom/self-hosted model declared without a `limit` block:

```jsonc
"qwen3.6-27b-fp8": { "name": "qwen3.6-27b-fp8", "attachment": true, "reasoning": false }
```

has an UNKNOWN context limit as far as omo is concerned. `runPreemptiveCompactionIfNeeded`
then hits `if (actualLimit === null) { log("... unknown context limit ..."); return }`
and **silently skips compaction forever**. The session grows unbounded until the
inference server itself rejects the request:

```
The input (152445 tokens) is longer than the model's context length (131072 tokens).
```

Note this input-only error format (no completion breakdown) means input ALONE already
exceeds the window — output-token reservation cannot save it; only earlier compaction can.

## Fix = declare the limit in the opencode provider config

```jsonc
"qwen3.6-27b-fp8": {
  "name": "qwen3.6-27b-fp8",
  "attachment": true,
  "reasoning": false,
  "limit": { "context": 131072, "output": 32000 }
}
```

This populates `modelContextLimitsCache["custom/qwen3.6-27b-fp8"] = 131072` and lets
`limit.output` flow into `getModelCapabilities().maxOutputTokens`, so BOTH the 0.78
input threshold AND the output-reservation guard engage and compact between explore
turns before the window overflows.

## Secondary symptom: the background-agent fallback storm

When the context error DOES fire on a background/subagent task, `fallback-retry-handler.ts`
`tryFallbackRetry` walks `task.fallbackChain` (the agent's hardcoded default chain:
gpt-5.4-mini-fast → qwen3.5-plus → minimax → claude-haiku → gpt-5.4-nano …). Its
reachability gate is bypassed when the connected-providers cache is empty
(`if (!connectedSet) return true`), so on a single-custom-provider setup every fallback
is attempted and each fails `Model not found: <provider>/<model>`. This path also does
NOT consult the user's `model_fallback: false` / `runtime_fallback.enabled: false`
config — those flags gate the chat/runtime fallback hooks, not the background-agent
retry. Fixing the root context overflow (declare the limit) removes the trigger; making
background fallback honor the disable-flags / prune unreachable providers is a separate
open gap.
