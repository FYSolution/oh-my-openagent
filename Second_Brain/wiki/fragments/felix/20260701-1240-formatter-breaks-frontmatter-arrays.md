---
type: lesson
target: wiki-tooling
section: frontmatter-parsing
created: 2026-07-01T12:40
author: felix
action: append
last_verified: 2026-07-01
trust: verified
ttl_days: 365
tags: [wiki-tooling, freshness, frontmatter, formatter, code-anchors, lesson]
---

# Lesson: Markdown formatters silently break single-line frontmatter arrays

## What happened

`code_anchors` was authored single-line (`code_anchors: [a@h1, b@h2]`). A
markdown/YAML formatter (format-on-save) reflowed it into a multiline flow
array:

```yaml
code_anchors: [a@h1, b@h2]
```

The original frontmatter parser only matched `^key:\s*(.+)$` + `^\[(.+)\]$`, so
a `key:` with an empty value followed by bracketed continuation lines was
**silently ignored**. The fragment then had no parsed anchors, so drift
detection was disabled and the fragment reported FRESH by age alone — a false
green.

## Fix

Both `compile-wiki.ps1` (`Parse-FragmentFrontmatter`) and `search-wiki.ps1`
(`Get-Frontmatter`) now pre-merge continuation lines into logical lines before
parsing: a line starts a new key only if it matches `^(\w[\w-]*):`, otherwise it
is appended to the current value. After merging, the existing `^\[(.*)\]$` flow
-array logic handles both single- and multi-line arrays, and empty split
elements (trailing commas) are filtered.

## Rule

Never assume authored frontmatter survives a formatter. Any frontmatter the
tooling depends on (especially `code_anchors`, which gates drift detection) MUST
be parsed tolerantly — merge continuations, don't require single-line. When
adding a new envelope field that the tooling reads, add a fixture with the
formatter's multiline output and assert it still parses.

## Meta

The freshness system caught its own regression: right after the parser fix, an
unrelated edit to `search-wiki.ps1` shifted the lines an analysis fragment was
anchored to, and the recompile immediately flagged that fragment DRIFTED —
line-range anchors break when anchored code moves, even if content (and thus the
hash) is unchanged. Re-stamp the line range on move.
