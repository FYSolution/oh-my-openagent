---
type: analysis
target: preemptive-compaction
section: output-token-reservation
created: 2026-07-30T15:00
author: felix
action: append
last_verified: 2026-07-30
trust: curated
ttl_days: 180
sources:
  [
    packages/omo-opencode/src/hooks/preemptive-compaction-trigger.ts,
    packages/omo-opencode/src/hooks/preemptive-compaction.ts,
    packages/omo-opencode/src/hooks/preemptive-compaction.test.ts,
    packages/model-core/src/context-limit-resolver.ts,
    packages/model-core/src/model-capabilities/get-model-capabilities.ts,
  ]
tags: [context-limit, compaction, preemptive, token-limit, completion-budget, max-output-tokens]
---

# Preemptive compaction: reserve the completion budget when deciding to compact

`preemptive-compaction-trigger.ts` (`runPreemptiveCompactionIfNeeded`) is the
**proactive** counterpart to the reactive `context-window-limit-recovery` hook. It
watches `message.updated` + `tool.execute.after`, caches the last assistant token
usage per session, and calls `client.session.summarize({ auto: true })` once usage
crosses `PREEMPTIVE_COMPACTION_THRESHOLD` (0.78) of the model's actual context limit.

## The bug it now guards against

An LLM request fails when `inputTokens + reservedCompletionTokens > contextLimit`,
NOT when `inputTokens` alone crosses the window. The old trigger compared only
`totalInputTokens / actualLimit` against 0.78, ignoring the completion reservation.

Observed failure (`custom/qwen3.6-27b-fp8`, context limit 131072, background
`explore` task):

```
Requested token count exceeds the model's maximum context length of 131072 tokens.
You requested a total of 138176 tokens: 106176 tokens from the input messages and
32000 tokens for the completion.
```

With a 32000-token completion reservation the request overflows once input passes
`131072 - 32000 = 99072` (~76%). But the compaction trigger only fired at
`0.78 * 131072 = 102236` input — _above_ the fail point — so the session overflowed
before compaction ever ran. The reactive recovery / model-fallback then had to bail
the request out (it re-queued on a 200k model, `github-copilot/claude-haiku-4.5`).

## Fix (2026-07-30)

`runPreemptiveCompactionIfNeeded` now reserves the model's max output budget:

```ts
const reservedOutputTokens = resolveReservedOutputTokens(providerID, modelID, actualLimit);
const usageRatio = (totalInputTokens + reservedOutputTokens) / actualLimit;
```

- `resolveReservedOutputTokens` reads `getModelCapabilities({providerID, modelID}).maxOutputTokens`
  and caps it at `floor(actualLimit / 2)` so a model that reports `output == context`
  cannot starve the input budget.
- When capabilities expose no output limit, reserved = 0 → **behavior unchanged**
  (this is why Anthropic 1M tests still pass: adding ≤ half-window headroom keeps the
  810k/1M cases above 0.78 and the small cases below it).

Net effect: for the qwen case compaction now fires at input ≥ `0.78*131072 - 32000`
≈ 70236 tokens, leaving headroom for the completion so the request fits the ORIGINAL
model instead of forcing a fallback to a bigger-context model.

## Boundary / precondition notes

- Requires a known context limit: `resolveActualContextLimit` returns the cached
  `modelContextLimitsCache.get(\`${providerID}/${modelID}\`)`for non-Anthropic
providers; if unknown it returns`null` and the trigger skips (unchanged).
- Only helps **multi-turn** sessions (needs a prior `message.updated` with token
  info). A first request that is already over-budget still relies on the reactive
  recovery + model-fallback path.
- Tests: `preemptive-compaction.test.ts` mocks `../shared/model-capabilities`; two
  new cases prove (a) reservation triggers compaction when input alone is sub-78% and
  (b) with no reservation the same input stays below threshold. Suite: 18 pass.
