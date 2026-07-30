---
type: analysis
target: context-window-limit-recovery
section: input-length-server-error
created: 2026-07-30T12:00
author: felix
action: append
last_verified: 2026-07-30
trust: curated
ttl_days: 180
sources:
  [
    packages/omo-opencode/src/hooks/anthropic-context-window-limit-recovery/parser.ts,
    packages/omo-opencode/src/hooks/anthropic-context-window-limit-recovery/executor.ts,
    packages/omo-opencode/src/hooks/anthropic-context-window-limit-recovery/target-token-truncation.ts,
    packages/omo-opencode/src/hooks/anthropic-context-window-limit-recovery/summarize-retry-strategy.ts,
    packages/omo-opencode/src/hooks/todo-continuation-enforcer/token-limit-detection.ts,
  ]
tags: [context-limit, compaction, truncation, recovery, parser, token-limit, inference-server]
---

# Context-window-limit recovery: how the harness compresses context on overflow

When a model/inference server rejects a request for exceeding its context length,
the error surfaces to the plugin as a `session.error` / `message.updated` event.
The `anthropic-context-window-limit-recovery` hook reacts and runs a two-stage
compression pipeline (this is the "compress the context window on exception"
behavior).

## Flow

1. `parser.ts` `parseAnthropicTokenLimitError()` detects the error via two gates:
   - keyword gate `isTokenLimitError` (`TOKEN_LIMIT_KEYWORDS`), and
   - numeric extraction `extractTokensFromMessage` (`TOKEN_LIMIT_PATTERNS`).
     Both must succeed to populate `currentTokens` / `maxTokens`. Numbers are needed
     because `executor.ts` gates aggressive truncation on
     `isOverLimit = currentTokens > maxTokens`.
2. `executor.ts` `executeCompact()`:
   - Stage A (opt-in `experimental.aggressive_truncation`): `target-token-truncation.ts`
     computes `tokensToReduce = currentTokens - maxTokens*0.8` and truncates the
     LARGEST tool outputs first until the target is met.
   - Stage B: `summarize-retry-strategy.ts` calls `client.session.summarize()` with
     exponential backoff (120s total window). Runs regardless of the flag.
3. `session-compacting` + `compaction.autocontinue` preserve todos/context and
   auto-resume the run.

## Change 2026-07-30 — recognize the `Input length (...) exceeds the maximum allowed length (...)` format

Some inference servers (e.g. llama.cpp / vLLM-style local servers) emit:

```
Input length (141382 tokens) exceeds the maximum allowed length (140534 tokens). Use a shorter input or enable --allow-auto-truncate.
```

This matched NONE of the existing keywords or numeric patterns, so it fell through
without extracting token counts — meaning Stage A (numeric truncation) never
engaged. Two surgical additions fixed it:

- `parser.ts`: added numeric pattern
  `/input length.*?(\d+).*?tokens.*?exceeds.*?maximum.*?(\d+)/i` to
  `TOKEN_LIMIT_PATTERNS`, and keyword `"maximum allowed length"` to
  `TOKEN_LIMIT_KEYWORDS`.
- `token-limit-detection.ts` (todo-continuation-enforcer): added the same
  `"maximum allowed length"` keyword to `TOKEN_LIMIT_FALLBACK_PATTERNS` so the
  continuation enforcer agrees this is a token-limit error.

`extractTokensFromMessage` always assigns the larger number as `current` and the
smaller as `max`, so `141382 > 140534` yields `current=141382, max=140534` →
`isOverLimit === true` → the existing compression path engages.

Regression tests added to `parser.test.ts` (string + object forms); 13 pass.
