---
type: decision
target: memory-freshness
section: freshness-envelope
created: 2026-07-01T11:30
author: felix
action: replace
last_verified: 2026-07-01
verified_commit: 11988a804
trust: curated
ttl_days: 365
sources: [Second_Brain/scripts/compile-wiki.ps1, Second_Brain/scripts/search-wiki.ps1, Second_Brain/scripts/anchor-hash.ps1]
tags: [memory, freshness, decision, drift-detection, trust, ttl, wiki-tooling]
---

# Decision: Freshness Envelope for Wiki Memory

## Context

The wiki is fragment-based and append-only. Fragments never expire, so old
knowledge and code-anchored claims silently rot as the codebase moves. Two
weaknesses hurt most: (1) no signal that a fragment's claim is stale, and (2)
no way to detect that the code a fragment describes has since changed. Both
erode trust in retrieved memory.

## Decision

Add an **optional, additive** "Freshness Envelope" to fragment frontmatter and
teach the existing PowerShell tooling to consume it. No runtime plugin change,
no schema break — fragments without envelope fields keep working (state
`UNKNOWN` / `curated` trust).

### Frontmatter fields (all optional)

- `last_verified` — ISO date the claim was last checked against reality. Falls
  back to `created` when absent.
- `verified_commit` — short SHA the verification was done at (provenance only).
- `trust` — `verified` | `curated` | `source` | `untrusted` (default `curated`).
- `ttl_days` — per-fragment override of the per-type default TTL.
- `code_anchors` — single-line array of `path#Lx-Ly@hash8` entries binding the
  claim to concrete code ranges.

### State machine

`FRESH → AGING → STALE` by age vs TTL (`age ≤ ttl` fresh, `≤ 3×ttl` aging, else
stale). Any anchor whose recomputed hash ≠ the stored `@hash8` forces
`DRIFTED` (overrides age). No parseable date → `UNKNOWN`. Severity rank:
DRIFTED 4 > STALE 3 > UNKNOWN 2 > AGING 1 > FRESH 0.

Per-type TTL defaults (days): lesson 180, decision 365, entity 30, concept 90,
source 14, analysis 60, overview 120, synthesis 60.

### Anchor hash algorithm

First 8 lowercase hex of SHA256 over the inclusive 1-indexed line range, each
line `TrimEnd`'d, joined with LF, UTF8. Deliberately language-agnostic and
distinct from hashline-core's xxHash so a future TS verifier and the PowerShell
tooling agree byte-for-byte.

## Consequences

- `compile-wiki.ps1` computes state per fragment, aggregates worst-state per
  target into `index.md` (Freshness column) and the manifest, and emits a
  `## Needs Verification` section + `needsVerification[]` for STALE/DRIFTED.
- `search-wiki.ps1` multiplies relevance by a freshness factor (FRESH 1.0 →
  DRIFTED 0.3) and a trust factor (verified 1.2 → untrusted 0.3), and shows a
  State badge column — so fresh, trusted knowledge ranks above stale hits.
- Authors stamp anchors with `anchor-hash.ps1 "path#Lx-Ly"`.

## Scope note (web content)

Scraped web content stays **out** of the committed wiki. It is per-user,
volatile, and license-encumbered. When a durable web-derived insight matters,
capture it as a normal fragment with `trust: source` and a short `ttl_days` so
it decays quickly. The runtime web-cache is a separate later increment.
