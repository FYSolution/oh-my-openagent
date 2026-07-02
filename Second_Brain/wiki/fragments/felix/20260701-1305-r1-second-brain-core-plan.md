---
type: analysis
target: second-brain-runtime
section: r1-implementation-plan
created: 2026-07-01T13:05
author: felix
action: replace
last_verified: 2026-07-01
trust: curated
ttl_days: 120
code_anchors: [Second_Brain/scripts/anchor-hash.ps1#L26-L44@de51bae0]
sources:
  [
    packages/hashline-core/package.json,
    packages/hashline-core/tsconfig.json,
    Second_Brain/scripts/compile-wiki.ps1,
    Second_Brain/scripts/search-wiki.ps1,
    package.json,
  ]
tags: [second-brain, runtime, r1, second-brain-core, ts-port, parity-test, plan]
---

# R1 Plan: `packages/second-brain-core` (pure-TS index engine)

Direct TS port of the two PowerShell scripts. Mirrors `hashline-core` package
conventions (minimal package.json + tsconfig + src/ barrel, kebab-case,
<=200 LOC/file, co-located `*.test.ts`). Zero OpenCode wiring -> gate is
`bun test` + `tsgo`, ships as one `work-with-pr`, unblocks R2-R4.

## Module map (each mirrors a proven pwsh function)

- `anchor-hash.ts` `computeAnchorHash(root, spec)` <- `Get-AnchorHash`
- `frontmatter-parser.ts` `parseFrontmatter(text)` <- `Parse-FragmentFrontmatter`
  (continuation-merge for multiline flow arrays)
- `freshness.ts` `freshnessOf(frag, { now })` <- `Get-FreshnessState`
- `fragment-loader.ts` `loadFragments(root)` — walk fragments/, parse, mtime
- `indexer.ts` `buildIndex(frags, { now })` -> Manifest — grouping + needsVerification
- `manifest.ts` `serializeManifest()` — exact `_manifest.json` shape (parity)
- `page-renderer.ts` `renderTargetPage/renderIndex` <- `Assemble-TargetPage`
- `search.ts` `searchWiki(index, query, opts)` <- `search-wiki.ps1` scoring
- `cache.ts` `loadIndex(root)` read-through + `persistIndex(root)` atomic
- `types.ts`, `constants.ts` (TTL defaults, factor tables, ranks, badges)

## Public API (index.ts barrel)

`computeAnchorHash`, `parseFrontmatter`, `freshnessOf`, `loadFragments`,
`buildIndex`, `loadIndex`, `persistIndex`, `searchWiki`, `readTarget`, types.

## pwsh <-> TS `_manifest.json` parity test (the interchangeability guarantee)

1. Fixture wiki under `test-support/second-brain-fixtures/` with FIXED
   created/last_verified dates and known anchors.
2. Commit a `golden-manifest.json` generated once by `compile-wiki.ps1` so CI
   needs NO pwsh (Ubuntu runners lack it).
3. Determinism via injected clock: read `golden.generated`, feed it as `now` to
   `buildIndex(frags, { now: golden.generated })` so age-based freshness
   reproduces exactly what pwsh computed at generation time. Drift is already
   now-independent (hash-based).
4. Assert `deepEqual(serializeManifest(ts), golden)` after stripping `generated`.
5. Optional live cross-check gated on pwsh-on-PATH for local/Windows runs.

Anchor hash: `computeAnchorHash(fixture)` must equal a committed golden hash
(plus optional live `anchor-hash.ps1` cross-check).

## Cross-runtime parity risks (tested explicitly)

- Line endings: pwsh `Get-Content` strips EOLs; TS must `split(/\r?\n/)` +
  `trimEnd()` per line so CRLF checkouts hash identically to LF.
- BOM: Node `readFile("utf8")` keeps a leading BOM; strip it to match pwsh.
- Single-element / trailing-comma arrays: replicate the empty-element filter,
  always return arrays.
- SHA256: first 8 lowercase hex; same sentinels (`SPEC`/`MISSING`/`RANGE`).

## Commit slicing (all `bun test` + `tsgo`, no opencode-qa)

R1.1 types+constants+anchor-hash | R1.2 frontmatter-parser (+formatter fixtures) |
R1.3 freshness (injectable clock) | R1.4 loader+indexer+manifest (+parity golden) |
R1.5 search | R1.6 cache+page-renderer | R1.7 barrel + wire into root `workspaces`.

## Wiring

Add `packages/second-brain-core` to root `package.json` `workspaces` (explicit
list, not a glob). Consumers depend via `"@oh-my-opencode/second-brain-core":
"workspace:*"`.

## Status: IMPLEMENTED (2026-07-01)

Delivered as planned with two intentional deviations from the module sketch:

- The manifest shape lives in `indexer.ts` (`buildManifest`) and `read-through.ts`
  (`persistIndex`/`loadIndex`/`rebuildIndex`) rather than separate `manifest.ts` +
  `cache.ts`; target-page rendering is `target-page.ts` (`renderTargetPage`/`readTarget`),
  not `page-renderer.ts`. Index-page rendering was NOT ported (R1 only needs the
  manifest producer + per-target read + search). `ordering.ts`, `text-lines.ts`,
  `date-parse.ts`, `manifest-target.ts` were split out to hold files under 200 LOC.
- `stateBadge` returns TEXTUAL tokens (`fresh`/`aging`/`stale`/`drifted`/`unknown`),
  not the pwsh emoji, to honor the repo no-emoji rule. Render-only, not parity-tested.

Parity is proven: committed `golden-manifest.json` (pwsh-generated) + injected clock
(`now = parseLocalDate(golden.generated)`) makes the deep-equal deterministic without
pwsh on CI. 28 tests pass (`bun test packages/second-brain-core/src`), `tsgo` clean.
Anchor golden `8b041f22` cross-checked via `anchor-hash.ps1`. All four cross-runtime
risks (CRLF, BOM, array-filter, SHA256 sentinels) have explicit tests.
