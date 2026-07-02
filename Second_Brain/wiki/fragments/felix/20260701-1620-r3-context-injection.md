---
type: analysis
target: second-brain-runtime
section: r3-context-injection
created: 2026-07-01T16:20
author: felix
action: append
last_verified: 2026-07-01
trust: curated
ttl_days: 90
sources:
  [
    packages/omo-opencode/src/hooks/second-brain-injector/hook.ts,
    packages/omo-opencode/src/tools/second-brain/context.ts,
    packages/omo-opencode/src/plugin/hooks/create-transform-hooks.ts,
    packages/omo-opencode/src/plugin/chat-message.ts,
    packages/omo-opencode/src/features/context-injector/types.ts,
    packages/omo-opencode/src/config/schema/second-brain.ts,
  ]
tags: [second-brain, runtime, r3, context-injection, hook, chat-message, gating]
---

# R3: auto-inject wiki context on knowledge queries (status: implemented)

Third increment of the Second_Brain runtime bridge. Adds a `second-brain`
ContextCollector source so the most relevant wiki page is auto-recalled on
knowledge-style questions and injected into the model context via the existing
context-injector path. OFF by default (gated on `second_brain.enabled`), so
zero blast radius for existing users.

## Pure core — `selectWikiContext`

`packages/omo-opencode/src/tools/second-brain/context.ts` exports a pure,
fully unit-testable `selectWikiContext(root, query, { now, maxChars, minScore,
searchTop })`:

1. `searchWiki` (from `second-brain-core`) for the top fragment hits.
2. Take the first hit with `score > minScore`, read its fragment frontmatter,
   resolve its `target`.
3. `readTarget(root, target)` to render the assembled page (lessons/decisions
   are excluded by `readTarget`, so those resolve to null → skip).
4. Truncate to `maxChars` with a `[...truncated]` marker.

Returns `{ target, content }` or null. Reused later by R4 (compaction
re-injection).

## Hook — `second-brain-injector`

`packages/omo-opencode/src/hooks/second-brain-injector/hook.ts` is a
`chat.message` handler that:

- Guards: synthetic/internal-only parts, system directives, slash commands
  (reuses `isSyntheticOrInternalOnlyTextParts`, `isSystemDirective`,
  `looksLikeSlashCommand`, `extractPromptText`, `removeSystemReminders`).
- `looksLikeKnowledgeQuery` intent gate — only fires on questions (`?` or a
  what/how/why/does/is/... lead word), keeping the token budget off ordinary
  work prompts.
- `extractQueryKeywords` — **critical**: `searchWiki` uses strict AND matching
  (every whitespace token must appear in one fragment), so a full NL sentence
  never matches. The hook strips punctuation + a stopword set and searches on
  the remaining content keywords.
- Registers into `contextCollector` at `priority: "low"`, `source:
"second-brain"`. Consumed by the existing
  `createContextInjectorMessagesTransformHook` — no new injection mechanism.

## Wiring

- `ContextSourceType` gained `"second-brain"`
  (`features/context-injector/types.ts`).
- `createTransformHooks` builds the hook gated on `second_brain.enabled &&
inject_context !== false`, threads `contextCollector`. It flows through
  `createCoreHooks` (`{...transform}`) into `CreatedHooks`.
- `ChatMessageHooks` gained `secondBrainInjector`; `runChatMessageHooks` calls
  it after `keywordDetector`.

## Config additions

`second-brain.ts` schema gained two used fields:

- `inject_context` (default true when enabled) — disable auto-injection while
  keeping the R2 tools.
- `max_inject_tokens` (100-20000, default 1500) — hard cap; the hook converts
  to chars at ~4 chars/token.

Schema regenerated into `assets/oh-my-opencode.schema.json`.

## Validation & remaining gate

13 unit tests green (selectWikiContext: match/no-match/truncation; hook:
intent gate, wiki-match registration, non-question skip, no-match skip), no
regressions in chat-message/transform-hook suites (45 pass), tsgo clean.

`opencode-qa` (live proof the context reaches the model) is still the
outstanding merge gate for R2 **and** R3 — it cannot run in the Windows VS Code
environment. `bun test` + `tsgo` is the local gate only.
