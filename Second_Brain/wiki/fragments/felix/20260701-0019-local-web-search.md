---
type: entity
target: local-web-search
section: overview
created: 2026-07-01T00:19
author: felix
action: replace
last_verified: 2026-07-01
verified_commit: 11988a804
trust: curated
ttl_days: 45
sources:
  [
    packages/omo-opencode/src/tools/web-search-local/,
    packages/omo-opencode/src/plugin/tool-registry-gated-tools.ts,
    packages/omo-opencode/src/mcp/websearch.ts,
    packages/omo-opencode/src/config/schema/websearch.ts,
  ]
tags: [web-search, tools, playwright, fetch, corporate, prefer-local, tool-registry]
---

# Local Web Search (`web_search`, prefer_local)

## Purpose

A local, browser-optional web search tool that transparently replaces the remote Exa/Tavily
web-search MCP when `websearch.prefer_local === true`. The LLM always sees a single `web_search`
tool; the `prefer_local` flag (config-time, not LLM-decided) chooses local vs remote at
registration time.

## Configuration

`~/.config/opencode/oh-my-openagent.json`:

```jsonc
{
  "websearch": {
    "prefer_local": true,
    "local": {
      "browser": "fetch-only", // "auto" | "fetch-only"
      "headless": false,
    },
  },
}
```

Schema: `packages/omo-opencode/src/config/schema/websearch.ts` — `LocalWebSearchConfigSchema`
includes `browser: z.enum(["auto", "fetch-only"]).optional()`.

## Registration wiring

- `packages/omo-opencode/src/mcp/websearch.ts` — returns `undefined` (skips the remote
  Exa/Tavily MCP) when `config?.prefer_local === true`, so the local tool takes over.
- `packages/omo-opencode/src/plugin/tool-registry-gated-tools.ts` — `createWebSearchToolsRecord({ pluginConfig, ctx })`
  returns `{ web_search }` only when `pluginConfig.websearch?.prefer_local === true`, else `{}`.
  Typed `Record<string, ToolDefinition>` (avoids the union-inference compile error an inline
  IIFE produced). Called from `tool-registry.ts` alongside the other gated-tool records.

## Execution modes

- `browser: "fetch-only"` — bypasses Playwright entirely. REQUIRED in corporate environments
  where group policy blocks ALL browser launches (Edge, Chrome, bundled Chromium, all headless).
  Calls `setFetchOnlyMode(true)` in `playwright-pool.ts`; `isBrowserAvailable()` then returns false.
- `browser: "auto"` — tries Playwright channels `["msedge", "chrome", undefined]` (10s launch
  timeout), falls back to fetch on failure.

## Fetch-based internals

- Search: `search-engine.ts` `searchDuckDuckGo` — POST to `https://html.duckduckgo.com/html/`
  with a form body `q=...` (a GET on `lite.duckduckgo.com` returns HTTP 202 bot-block). Results
  parsed via regex on `result__a` (links) and `result__snippet` (snippets).
- Scrape: `page-scraper.ts` `scrapePage` tries Playwright when `isBrowserAvailable()`, else
  `scrapeWithFetch` — `fetch()` + HTML tag stripping + link extraction.

## Verified behavior

End-to-end against the real OpenCode binary: the LLM autonomously invokes `web_search`, the
fetch path runs with no browser, and accurate answers return with source links. Tool registry
logs 14 tools including `web_search` when `prefer_local` is on.
