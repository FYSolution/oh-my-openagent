---
type: decision
target: second-brain-runtime
section: search-recall
created: 2026-07-02T17:40
author: felix
action: append
sources: [packages/second-brain-core/src/search.ts, Second_Brain/scripts/search-wiki.ps1]
last_verified: 2026-07-02
verified_commit: 11988a804
trust: verified
ttl_days: 365
code_anchors: [packages/second-brain-core/src/search.ts#L124-L128@1490baf4]
tags: [second-brain, search, recall, or-fallback, tags, target, weighting, decision]
---

# Decision: OR fallback + target/tag weighting in wiki search

## Context

Wiki search was strict keyword **AND** — every keyword had to appear literally in
a fragment or the file was dropped. Two failure modes hurt recall: vocabulary
mismatch (question words don't overlap the fragment's words) and AND brittleness
(a file matching 4 of 5 keywords scored the same as one matching 0). On the
auto-injection path an empty result silently injected nothing.

## Change (both `search.ts` and `search-wiki.ps1`)

- **Tag/target weighting.** Each keyword that also hits a fragment's frontmatter
  `target` adds `+6`, and a `tags` hit adds `+3`, to the base score. Curated
  tags/target act as synonyms and lift the right pages.
- **OR fallback.** Files are evaluated once for `matchedCount` (how many keywords
  hit body/target/tags). AND still wins when any file matches every keyword; only
  when AND yields nothing does it fall back to OR — all files matching ≥1 keyword,
  with the score scaled by `matchedCount / keywordCount` so the closest partial
  matches surface instead of returning nothing.

Base score is `hitCount + bestLine×5 + tagTargetBonus`, then
`× fraction × freshnessFactor × trustFactor`. In AND mode `fraction = 1`, so AND
ranking is unchanged except for the new tag/target bonus.

## Tradeoff observed

Because `target` matches are substring matches, a common keyword embedded in a
target name (e.g. "search" inside `local-web-search`) plus high body density can
outrank a more distinctive but less frequent keyword. This is acceptable — it
never drops correct AND matches, only reorders — but a future refinement could
weight whole-word target matches over substrings.

## Verification

`bun test packages/second-brain-core/src/search.test.ts` — added two tests: an
OR-fallback case (`gizmo zzznomatch` recovers the gizmo fragments when AND is
empty) and a weighting case (equal body hits, the target/tag match ranks first).
Full second-brain surface: 62 pass, 0 fail. PowerShell twin smoke-tested for
both AND and OR paths.
