---
type: analysis
target: memory-freshness
section: implementation-walkthrough
created: 2026-07-01T11:45
author: felix
action: replace
last_verified: 2026-07-02
verified_commit: 11988a804
trust: verified
ttl_days: 60
code_anchors: [Second_Brain/scripts/anchor-hash.ps1#L26-L44@de51bae0, Second_Brain/scripts/search-wiki.ps1#L142-L152@3164d572]
tags: [memory, freshness, analysis, code-anchors, drift-detection, self-demonstrating]
---

# Analysis: How the Freshness Envelope Detects Drift

This fragment is **self-demonstrating** — its own `code_anchors` point at the
real implementation, so `compile-wiki.ps1` recomputes each anchor's hash on
every build. While the anchored code is unchanged it reports **FRESH**; the
moment either range is edited without re-stamping, this fragment flips to
**DRIFTED** and lands in `index.md` → `## Needs Verification`.

## Anchor 1 — the hash algorithm itself

`Second_Brain/scripts/anchor-hash.ps1#L26-L44@de51bae0` binds to `Get-AnchorHash`:
it reads the inclusive line range, `TrimEnd`s each line, joins with LF, and
returns the first 8 hex of SHA256. TrimEnd makes trailing-whitespace-only edits
invisible; any semantic change to those lines changes the hash.

## Anchor 2 — the ranking weights

`Second_Brain/scripts/search-wiki.ps1#L142-L152@3164d572` binds to
`Get-FreshnessFactor` + `Get-TrustFactor`. These are the exact multipliers that
push fresh, trusted knowledge up and stale/untrusted hits down in search. If a
future edit re-tunes the numbers, this analysis (which cites them) drifts and
demands re-verification — exactly the intended feedback loop.

## Why this matters

Prose claims about code are the first thing to rot. Anchoring a claim to the
lines it describes turns "is this still true?" from a manual audit into a
mechanical hash compare run on every wiki compile. Combined with TTL-based age
decay, retrieval can now prefer knowledge that is both recent and code-consistent.

## Verification

Run `pwsh Second_Brain/scripts/compile-wiki.ps1`; this fragment's target
(`memory-freshness`) shows ✅ in the index while the anchors match. Edit either
anchored range and recompile to watch it turn 🔴 DRIFTED.
