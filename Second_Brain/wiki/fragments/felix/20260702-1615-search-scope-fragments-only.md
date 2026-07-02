---
type: decision
target: second-brain-runtime
section: search-scope
created: 2026-07-02T16:15
author: felix
action: append
sources: [packages/second-brain-core/src/search.ts, packages/second-brain-core/src/fragment-loader.ts, Second_Brain/scripts/search-wiki.ps1]
last_verified: 2026-07-02
verified_commit: 11988a804
trust: verified
ttl_days: 365
code_anchors: [packages/second-brain-core/src/search.ts#L142-L144@ae49bcb1]
tags: [second-brain, search, wiki, scope, determinism, decision]
---

# Decision: `searchWiki` scans `wiki/fragments/` only

## Context

`searchWiki` (and its PowerShell twin `search-wiki.ps1`) previously walked the
whole `wiki/` tree, so it descended into `wiki/.compiled/`, `wiki/log/`, and
`wiki/journal/` as well as `wiki/fragments/`. Analysis showed `.compiled/` adds
zero recall — every compiled page is a mechanical assembly of its source
fragments — while introducing real bugs.

## Why scan fragments only

- **Determinism across machines.** `.compiled/` is gitignored and only exists
  after `compile-wiki.ps1` / `loadIndex` runs, so including it made search
  results depend on local generated state.
- **It silently broke auto-injection.** `selectWikiContext.resolveTarget` reads
  the hit file's `frontmatter.target`; compiled pages have no frontmatter, so a
  compiled top-hit resolved to `null` and suppressed context injection even when
  a valid fragment existed.
- **Duplicate / inflated hits.** Each fact matched in both the fragment and its
  compiled copy; aggregate compiled pages merge N fragments and inflate the
  hit-count that drives `baseScore`.
- **Freshness/trust ranking is meaningless for compiled pages** (no frontmatter
  → state `UNKNOWN`).
- **~2x I/O** from scanning duplicated text.

## Change

- `searchWiki` now roots at `fragmentsRootOf(secondBrainRoot)` (`wiki/fragments/`)
  and skips `README.md`, mirroring `listFragmentFiles`. Result paths stay
  relative to `wiki/` (e.g. `fragments/felix/...`), so `resolveTarget` is
  unaffected.
- The optional `folder` arg now restricts to a fragments subfolder (author),
  e.g. `felix` — the previous `entities`/`concepts` examples never worked because
  those dirs exist only under `.compiled/`.
- `search-wiki.ps1` updated identically so the manual (VS Code) path and the
  runtime (TS) path stay consistent.

## Verification

`bun test packages/second-brain-core/src/search.test.ts` — added two tests:
author-folder restriction, and a temp-dir case proving a `.compiled/` copy and a
`README.md` are excluded while the committed fragment is returned. Manifest
parity and read-through suites still green.
