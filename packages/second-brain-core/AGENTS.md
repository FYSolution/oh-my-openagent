# second-brain-core

Pure-TypeScript engine that produces the Second Brain wiki index at runtime. It is a
faithful port of the canonical PowerShell tooling under `Second_Brain/scripts/`:

- `anchor-hash.ts` <- `anchor-hash.ps1` (`Get-AnchorHash`) — SHA256, first 8 lowercase
  hex over the 1-indexed inclusive line range, each line `TrimEnd`'d, joined with LF,
  UTF8. Must stay byte-identical so both producers agree on drift.
- `frontmatter-parser.ts` <- `Parse-FragmentFrontmatter` — merges continuation lines so
  formatter-reflowed multiline flow arrays collapse back onto their key.
- `freshness.ts` <- `Get-FreshnessState` — FRESH/AGING/STALE state machine with a DRIFTED
  override; per-type TTL defaults; injectable clock (`now`).
- `indexer.ts` <- the target-grouping / manifest block — emits the SAME `_manifest.json`
  contract the compiler writes.
- `search.ts` <- `search-wiki.ps1` — keyword AND search, relevance x freshness x trust.
- `read-through.ts` — `loadIndex` uses `.compiled/_manifest.json` when it is newer than
  every fragment, otherwise rebuilds in TS and (optionally) persists atomically.

## Parity contract

`_manifest.json` shape and anchor hashes are locked to the PowerShell output by
`manifest-parity.test.ts` and `anchor-hash.test.ts` against a committed golden generated
by the real `compile-wiki.ps1` (see `test-support/second-brain-fixtures/basic/`). CI needs
no `pwsh`; the golden is compared with an injected clock (`now = golden.generated`) so
age-based freshness reproduces deterministically. An optional live check runs the real
script when `pwsh` is on PATH.

## Conventions

Bun only. `tsgo --noEmit` for typecheck, `bun test src/*.test.ts` for tests. No path
aliases, kebab-case files, factory-free pure functions, <=200 LOC per file.
