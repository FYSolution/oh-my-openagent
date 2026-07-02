---
type: entity
target: local-web-search
section: pagination
created: 2026-07-01T10:40
author: felix
action: replace
last_verified: 2026-07-01
verified_commit: 11988a804
trust: curated
ttl_days: 45
sources:
  [
    packages/omo-opencode/src/tools/web-search-local/pagination-detector.ts,
    packages/omo-opencode/src/tools/web-search-local/page-scraper.ts,
    packages/omo-opencode/src/tools/web-search-local/constants.ts,
    packages/omo-opencode/src/tools/web-search-local/pagination-detector.test.ts,
  ]
tags: [web-search, pagination, fetch-only, crawl-loop, corporate]
---

# Local Web Search — Pagination

## Two detection paths (browser vs fetch)

`page-scraper.ts` populates `PageResult.paginationNext`, consumed by `crawl-loop.ts`
(`COLLECT_AND_CONTINUE` enqueues `paginationNext` at the SAME depth).

- **Browser path** (`scrapeWithPlaywright`): `detectPaginationNext(page, url)` runs inside
  `page.evaluate` on the live DOM.
- **Fetch path** (`scrapeWithFetch`): `detectPaginationNextFromHtml(html, url)` runs on the
  raw HTML string. Added 2026-07-01 — previously this path hardcoded `paginationNext: null`,
  so pagination auto-follow did NOT work in `browser: "fetch-only"` mode (the corporate
  default where all Playwright launches are blocked).

## Fetch-path strategies (priority order)

`detectPaginationNextFromHtml` mirrors the browser detector, reading the site's declared
href rather than string-constructing the next URL:

1. **`rel="next"`** on `<link>` or `<a>` (handles `rel="prev next"`). Pattern-agnostic —
   works for path-based, cursor, or offset URLs because the site declares the exact href.
2. **Next-labeled anchor**, scoped to a pagination container (element whose class/id/
   aria-label contains `pagination|pager|page-nav`), within a `PAGINATION_REGION_MAX_CHARS`
   (4000) window. Matches `PAGINATION_NEXT_PATTERNS` (`next`, `›`, `»`, `→`, `older`).
   Container scoping prevents false positives on prose links like "next steps".
3. **Numeric inference** (fallback only): parse `?page`/`?p` from the current URL, find a
   same-origin anchor with value `+ 1`. This is the only strategy that assumes a URL scheme.

## Volume limits (unchanged)

Pagination continuation is bounded by the crawl budget, not exhaustive:
`domainPageCap = 5` (single paginated site capped at 5 pages), `maxPages = 10` (tool cap 15),
`consecutiveSkips = 3`, and LLM `goal_completion >= 0.8` early-stop. Deep (>10 sub-page)
traversal is intentionally NOT implemented.

## Tests

`pagination-detector.test.ts` — 7 given/when/then cases covering rel=next, `rel="prev next"`,
container next-anchor, prose false-positive rejection, `?page` inference, cross-origin
rejection, and the no-signal null case.
