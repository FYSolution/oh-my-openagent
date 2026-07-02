---
type: entity
target: local-web-search
section: output-normalization
created: 2026-07-01T11:05
author: felix
action: replace
last_verified: 2026-07-01
verified_commit: 11988a804
trust: curated
ttl_days: 45
sources:
  [
    packages/omo-opencode/src/tools/web-search-local/format-results.ts,
    packages/omo-opencode/src/tools/web-search-local/tool.ts,
    packages/omo-opencode/src/hooks/websearch-local-redirect/hook.ts,
    packages/omo-opencode/src/tools/web-search-local/constants.ts,
    packages/omo-opencode/src/tools/web-search-local/index.ts,
    packages/omo-opencode/src/tools/web-search-local/format-results.test.ts,
  ]
tags: [web-search, normalization, formatter, redirect-hook, consistency]
---

# Local Web Search — Output Normalization

## Problem

There are two local entry points that both crawl and then render a `CrawlResult` for the
LLM, and they had DIVERGED:

- **Direct tool** (`tool.ts`, the `web_search` tool): emitted `### [N] Title` /
  `**URL:**` / content markdown, with UNCAPPED per-entry content.
- **Redirect hook** (`websearch-local-redirect/hook.ts`): emitted Exa-style
  `Title:/URL:` text capped at 1500 chars, delivered via `throw new Error(...)`.

Same underlying `CrawlResult`, two different LLM-facing shapes and two different content
caps — an inconsistency depending purely on which path served the request.

## Solution — single canonical formatter

`format-results.ts` exports `formatWebSearchResult(result: CrawlResult): string`. Both
local paths render through it:

- `tool.ts` → `return formatWebSearchResult(result)` (both empty and non-empty).
- `hook.ts` → `throw new Error(formatWebSearchResult(result))` (throw-based delivery
  preserved; OpenCode surfaces the thrown message as tool output).

### Canonical shape

Header block (`## Web Search Results`, `**Query:**`, `**Goal:**`, `**Pages visited:**`,
`**Results found:**`), then per entry `### [N] Title` / `**URL:**` / `**Relevance:**` /
content, then `---` + `**Synthesis:**`. Empty case: header + `No relevant results found.`
line, synthesis omitted.

### Consistent content cap

`MAX_RESULT_CONTENT_CHARS = 2000` (constants.ts) — applied per entry by the formatter with
a `...` ellipsis. Replaces the old uncapped (direct) vs 1500 (redirect) split.

## Scope boundary

Only the LOCAL crawler output is normalized. Remote Exa/Tavily MCP output is owned by the
remote servers and consumed directly by the LLM as free text — deliberately NOT routed
through this formatter.

## Verification

`bun test packages/omo-opencode/src/tools/web-search-local/` → 10 pass (3 new formatter
cases: canonical non-empty shape, empty-results line + no synthesis, content truncation).
`typecheck:packages` EXIT=0.
