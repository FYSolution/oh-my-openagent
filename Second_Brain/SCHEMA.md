# Second Brain — Wiki Operating Schema (Fragment Architecture)

## Project: [Your Project Name]

## Purpose

Persistent, **team-shared** project memory. Analysis, summary, indexing, and long-term
knowledge retention for the entire development team.

This system is NOT about coding behavior (that's governed by Karpathy Guidelines separately).

Multiple LLM agents (one per developer) maintain a structured wiki that compounds knowledge
over time. The architecture is designed to **make merge conflicts structurally impossible**
when multiple developers commit wiki updates concurrently.

---

## Core Principles

1. **Knowledge compounds** — Every ingest, query, and code task makes the wiki richer.
   Insights accumulate alongside ingested sources. Nothing valuable stays trapped in
   ephemeral chat history.
2. **Maintenance cost ≈ zero** — The LLM handles all synthesis, cross-referencing, and
   bookkeeping. Humans curate sources, direct analysis, and ask good questions.
3. **Persistent artifact > ephemeral chat** — The wiki is the durable output. Chat
   sessions are transient; their value must be captured in fragments before the
   session ends.
4. **Synthesis over retrieval** — The LLM synthesizes knowledge from fragments at
   session start, producing richer understanding than raw text concatenation.
5. **Zero-conflict by construction** — Each developer writes only to their own folder.
   Merge conflicts are architecturally impossible for all daily operations.

---

## Fragment Architecture — Why It Works

### The Problem with Shared Mutable Files

Traditional wiki designs let multiple developers edit the same file (e.g., `entities/auth.md`).
Git produces merge conflicts even when edits are semantically compatible. This creates noise,
blocks CI, and wastes developer time.

### The Solution: Immutable Fragments + AI Synthesis

```
COMMITTED (shared via git, zero-conflict):
  wiki/fragments/{user}/{timestamp}-{topic}.md   ← atomic knowledge units
  wiki/log/{user}/YYYY-MM-DD.md                  ← operation logs
  wiki/journal/{user}/YYYY-MM-DD.md              ← daily summaries

GITIGNORED (compiled locally, never committed):
  wiki/.compiled/                                ← AI-synthesized + mechanically assembled
```

**Each developer writes ONLY to their own folder.** Git never conflicts on new file
creation in different paths — it's structurally impossible.

**The LLM synthesizes at read-time** — it reads all fragments from all users,
applies merge strategies, resolves contradictions intelligently, and produces
coherent understanding. This is real AI synthesis, not dumb concatenation.

---

## Team Collaboration Design

### Zero-Conflict Guarantee

| Content Type | Path | Conflict Risk |
|---|---|---|
| Knowledge fragments | `wiki/fragments/{user}/` | **Impossible** — per-user folders |
| Operation logs | `wiki/log/{user}/` | **Impossible** — per-user folders |
| Daily journals | `wiki/journal/{user}/` | **Impossible** — per-user folders |
| Code-update reports | `raw/code-updates/{user}-*.md` | **Impossible** — per-user files |
| Raw sources | `raw/` | **None** — immutable after add |
| Compiled output | `wiki/.compiled/` | **None** — gitignored |

### Username Convention

Each developer's LLM uses a consistent username identifier. This is set in the
developer's local `.env` or derived from their git `user.name`:

```
SECOND_BRAIN_USER=fyang
```

If not configured, fall back to git: `git config user.name` → lowercase, no spaces
(e.g., "Frank Yang" → "frankyang").

---

## Architecture

| Layer | Path | Owner | Rule |
|---|---|---|---|
| Schema | `SCHEMA.md` | Team | Operating manual, co-evolved via PRs |
| Raw | `raw/` | Human | Immutable — LLM reads but NEVER modifies |
| Fragments | `wiki/fragments/` | LLM(s) | Per-user folders, immutable after commit |
| Logs/Journals | `wiki/log/`, `wiki/journal/` | LLM(s) | Per-user folders |
| Compiled | `wiki/.compiled/` | LLM (local) | Gitignored, generated at session start |
| Scripts | `scripts/` | Team | Automation helpers |

### Raw Sources (`raw/`)

Human-curated, immutable once added. This is the source of truth.

| Folder | Contents |
|---|---|
| `raw/requirements/` | Business requirement documents (BR*.md) |
| `raw/design/` | Architecture & design decision documents |
| `raw/sessions/` | Chat transcripts / session notes (dropped in by user) |
| `raw/decisions/` | Meeting notes, client feedback, scope changes |
| `raw/code-updates/` | Code change reports (per session/commit) |
| `raw/analysis/` | Solution reports, security scans, performance analysis |
| `raw/architecture/` | Solution structure snapshots, service inventory |

### Fragments (`wiki/fragments/{user}/`)

LLM-generated atomic knowledge units. Each fragment is:
- **Owned by one user** — written to `fragments/{user}/` only
- **Immutable after commit** — to update knowledge, create a NEW fragment
- **Self-describing** — YAML frontmatter declares type, target, action, provenance

### Compiled Output (`wiki/.compiled/`)

Gitignored. Produced by `scripts/compile-wiki.ps1` (mechanical assembly) and then
enriched by the LLM's in-context synthesis. Serves as the readable "wiki view."

---

## Fragment Specification

### File Naming

```
wiki/fragments/{user}/{YYYYMMDD}-{HHMM}-{short-topic}.md
```

Examples:
- `wiki/fragments/fyang/20260614-0930-auth-token-config.md`
- `wiki/fragments/jsmith/20260614-1445-cache-redis-setup.md`

### YAML Frontmatter (Required)

```yaml
---
type: entity|concept|lesson|decision|source|analysis|overview|synthesis
target: auth-service          # which compiled page this contributes to
section: token-management     # optional: specific section within the target
created: YYYY-MM-DDTHH:MM
author: {username}
action: append|replace|correct
sources: [raw/requirements/BR01.md]   # raw sources that inform this
tags: [authentication, jwt]
supersedes:                   # optional: fragment ID(s) this replaces
synthesized-from:             # optional: for type=synthesis, list source fragments
---
```

### Fragment Types

| Type | Default Action | Purpose |
|---|---|---|
| `entity` | `replace` | State of a specific service/component |
| `concept` | `replace` | Cross-cutting pattern or architectural concept |
| `lesson` | `append` | Lesson learned — always accumulates, never overwrites |
| `decision` | `append` | Design decision — history matters |
| `source` | `replace` | Summary of an ingested raw document |
| `analysis` | `append` | Investigation result, comparison, synthesis answer |
| `overview` | `replace` | Project-level architectural state |
| `synthesis` | `replace` | AI-produced synthesis of multiple fragments |

### Action Semantics

| Action | Compilation Behavior |
|---|---|
| `append` | All fragments with same target+section coexist, sorted chronologically |
| `replace` | Latest fragment (by `created` timestamp) wins for same target+section; older shown in history |
| `correct` | Explicitly marks older claims as wrong; shown as correction with explanation |

---

## Operations

### Session Start (Context Loading + Compilation)

Before responding to the first task:

1. **Run `scripts/compile-wiki.ps1`** — produces manifest + mechanical assembly
2. **Read `.compiled/_manifest.json`** — understand what knowledge exists
3. **Read `.compiled/index.md`** — page catalog for navigation
4. **Read own recent log:** `wiki/log/{user}/` (latest file)
5. **Scan other users' recent logs:** `wiki/log/*/` (last entry each)
6. **Synthesize relevant pages** — read fragment groups for the current task,
   produce intelligent synthesis in working memory (not just concatenation)
7. **Auto-ingest un-ingested sources** — compare files in `raw/` against fragments
   with `type: source`. If any raw file has no corresponding source fragment,
   ingest them automatically:

   > "Auto-ingested X new raw source(s): [list with brief one-line summary each]."

### AI Synthesis at Read-Time

When the LLM needs information about a topic (e.g., "auth-service"):

1. Read `.compiled/_manifest.json` → find all fragments for `target: auth-service`
2. Read those fragment files directly
3. **Synthesize intelligently:**
   - Identify the latest state (from `replace` fragments)
   - Accumulate all lessons (from `append` fragments)
   - Flag contradictions between fragments
   - Consider authorship and recency for reliability
   - Cross-reference with `raw/code-updates/` for staleness
4. Use synthesized understanding to answer/guide
5. **Optionally persist synthesis** — if the synthesis revealed significant new
   understanding, write a `type: synthesis` fragment to save the work

### When to Write Synthesis Fragments

Write a `type: synthesis` fragment when:
- Many (5+) fragments exist for one target, making raw reading expensive
- Cross-cutting analysis connects knowledge from multiple targets
- A new team member would benefit from a pre-built summary
- The entity has evolved significantly (3+ replace cycles)

Synthesis fragments are the LLM's "compiled knowledge" — they save future sessions
from re-deriving the same understanding from raw fragments.

```yaml
---
type: synthesis
target: auth-service
created: 2026-06-14T10:00
author: copilot-fyang
action: replace
synthesized-from:
  - fyang/20260614-0930-auth-token-config.md
  - jsmith/20260612-1100-auth-rate-limit.md
  - fyang/20260601-0800-auth-initial.md
tags: [entity, authentication, synthesis]
---

# Auth Service — Synthesized State

[AI-written coherent narrative incorporating all source fragments...]
```

### Synthesis Priority Rules

When the LLM reads multiple fragments for a target and must determine current truth:

| Priority | Rule | Rationale |
|---|---|---|
| 1st | `action: correct` fragments | Explicit correction always wins |
| 2nd | Latest `action: replace` by timestamp | Newest state supersedes older |
| 3rd | Fragments citing `sources: [raw/...]` | Backed by source documents = higher confidence |
| 4th | Fragments matching recent `raw/code-updates/` | Cross-referenced with actual code changes |
| 5th | Older `replace` fragments | Historical context only, not current truth |

**Conflict detection:** When two `replace` fragments for the same target+section exist
from different authors within the same day, the LLM:
1. Uses latest timestamp as default truth
2. Checks source citations — cited source > uncited
3. Cross-references with `raw/code-updates/` for verification
4. If unresolvable, flags conflict and asks developer to clarify
5. Writes a `correct` fragment documenting the resolution

### Synthesis Freshness Detection

Before reading fragments for a target, check if existing synthesis is still valid:

```
1. Find latest synthesis fragment (type: synthesis) for the target
2. Get its `created` timestamp and `synthesized-from` list
3. Check: are there any fragments for this target that are:
   - Created AFTER the synthesis timestamp? → STALE
   - NOT listed in `synthesized-from`? → STALE
4. If STALE:
   - Read existing synthesis + only the NEW fragments
   - Produce INCREMENTAL update (not full re-synthesis)
   - Write new synthesis fragment (supersedes old one)
5. If FRESH:
   - Use existing synthesis directly (no re-work needed)
```

**Synthesis is shared via Git.** Once any developer's LLM writes a synthesis fragment
and commits it, ALL other developers get it on `git pull`. Their LLMs read the
committed synthesis directly — no need to re-derive independently.

This means:
- Synthesis work happens **once**, reused by the entire team
- New team members get instant context from existing synthesis fragments
- Incremental updates are cheap (read synthesis + 1-2 new fragments)
- In quiet periods, no synthesis work happens at all

### Task Completion (Auto Wiki Update)

**After completing a code modification task, write fragments as the FINAL step.
This is part of task completion, not a separate request.**

> ⚠️ **Scope:** This applies to ALL tasks that create, modify, or delete files —
> including changes to the wiki system itself. If you touched files, you track it.

1. **CREATE** `raw/code-updates/{user}-YYYY-MM-DD.md` (append if exists):

   ```markdown
   ## [HH:MM] Task Description

   ### Files Modified
   - path/to/file.cs — reason for change

   ### Decisions
   - What was chosen and why

   ### DevOps
   - Task #ID (if mentioned)
   ```

2. **CREATE** `wiki/journal/{user}/YYYY-MM-DD.md` (append if exists):
   - Synthesized summary (concise bullets, not raw dump)
   - Include `**Author:** {user}` header

3. **CREATE fragment(s)** in `wiki/fragments/{user}/`:
   - Entity gained new capability → `type: entity, action: replace`
   - New lesson learned → `type: lesson, action: append`
   - Design decision made → `type: decision, action: append`
   - Pattern changed → `type: concept, action: replace`
   - Correcting wrong info → `action: correct`

4. **APPEND** to `wiki/log/{user}/YYYY-MM-DD.md`:

   ```
   ## [HH:MM] action | description
   ```

5. **Run `scripts/compile-wiki.ps1`** to refresh local compiled view.

### Ingest (triggered by: "ingest [path]")

When user adds a new raw source:

1. Read the raw source completely
2. Summarize key points to user
3. **CREATE** `wiki/fragments/{user}/{timestamp}-source-{slug}.md`:
   ```yaml
   type: source
   target: {slug}
   action: replace
   sources: [raw/path/to/file.md]
   ```
4. **CREATE additional fragments** for affected entities/concepts
5. **Flag contradictions** — if new source contradicts existing fragments, create
   a fragment with `action: correct`
6. Append to `wiki/log/{user}/YYYY-MM-DD.md`: `## [HH:MM] ingest | source-name`
7. Run `scripts/compile-wiki.ps1`

### Lint (triggered by: "lint wiki")

Health-check the wiki for:

- [ ] Raw sources not yet represented by `type: source` fragments
- [ ] Stale fragments — code changed (per `raw/code-updates/`) but no fragment update
- [ ] Contradictions — multiple `replace` fragments for same target+section from same period
- [ ] Orphan targets — fragments reference targets with no other fragments
- [ ] Missing synthesis — targets with 5+ fragments but no `type: synthesis` fragment
- [ ] Lessons that may be outdated (referenced code patterns no longer exist)
- [ ] Knowledge gaps — entities mentioned in fragments but lacking dedicated target pages

### Query (triggered by questions about the project)

1. Read `.compiled/_manifest.json` to find relevant fragment groups
2. Read those fragments directly
3. Synthesize answer with citations to raw sources
4. **Auto-update** — if the answer revealed new knowledge, write a fragment
5. **Promote by default** — substantive query answers become `type: analysis` fragments

---

## Compilation Script (`scripts/compile-wiki.ps1`)

The script performs **mechanical assembly** — grouping, sorting, and formatting.
It does NOT perform AI synthesis (that's the LLM's job at read-time).

### What It Produces

```
wiki/.compiled/
  _manifest.json       ← structured catalog of all fragments
  index.md             ← navigable page list with stats
  overview.md          ← assembled from type=overview fragments
  lessons.md           ← ALL type=lesson fragments, chronological
  entities/
    auth-service.md    ← assembled from fragments targeting "auth-service"
  concepts/
    caching.md         ← assembled from fragments targeting "caching"
  sources/
    BR01.md            ← assembled from type=source fragments
  analysis/
    comparison-x.md    ← assembled from type=analysis fragments
```

### Manifest Format (`_manifest.json`)

```json
{
  "generated": "2026-06-14T10:00:00",
  "totalFragments": 47,
  "targets": {
    "auth-service": {
      "type": "entity",
      "fragments": [
        {
          "file": "fyang/20260614-0930-auth-token-config.md",
          "section": "token-management",
          "action": "replace",
          "created": "2026-06-14T09:30",
          "author": "fyang"
        }
      ],
      "lastUpdated": "2026-06-14",
      "authors": ["fyang", "jsmith"],
      "hasConflicts": false,
      "hasSynthesis": true
    }
  },
  "lessons": [...],
  "decisions": [...]
}
```

### Mechanical Assembly Rules

For each target page, the script:

1. Groups fragments by `target` + `section`
2. Within each section, sorts by `created` timestamp (newest first)
3. Applies action rules:
   - `replace`: shows latest only, older in `<details>` history
   - `append`: shows all, newest first
   - `correct`: shows correction prominently, strikethrough on corrected claim
4. Adds metadata header (authors, last updated, fragment count)
5. Flags staleness if `raw/code-updates/` has newer entries than latest fragment

---

## Fragment Lifecycle & Knowledge Evolution

### Creating Knowledge

```
Developer works on auth feature:
  → LLM creates: fragments/fyang/20260614-0930-auth-token-config.md
       type: entity, target: auth-service, section: token-management, action: replace
  → LLM creates: fragments/fyang/20260614-0930-lesson-jwt-cookies.md
       type: lesson, target: lessons, section: authentication, action: append
  → Commits and pushes (only new files in own folder)
```

### Updating Knowledge

```
Same developer, 3 days later, changes auth config:
  → LLM creates: fragments/fyang/20260617-1400-auth-token-shorter.md
       type: entity, target: auth-service, section: token-management, action: replace
       supersedes: fyang/20260614-0930-auth-token-config.md
  → Old fragment stays committed (history), new one is now "latest"
```

### Correcting Knowledge

```
Developer B finds Developer A's info is wrong:
  → LLM creates: fragments/jsmith/20260615-1000-auth-correction.md
       type: entity, target: auth-service, section: token-management, action: correct
       supersedes: fyang/20260614-0930-auth-token-config.md
       ---
       CORRECTION: JWT expiry is actually 15 minutes, not 30.
       Verified in appsettings.Production.json line 42.
```

### Synthesizing Knowledge

```
LLM at session start finds 12 fragments for auth-service:
  → Reads all 12, produces intelligent synthesis
  → Writes: fragments/fyang/20260618-0900-auth-service-synthesis.md
       type: synthesis, target: auth-service, action: replace
       synthesized-from: [list of 12 fragment IDs]
  → Future sessions read the synthesis fragment first (cheaper)
  → Still can read underlying fragments if deeper detail needed
```

---

## Conflict Resolution — Contradictory Fragments

### Detection (by the compilation script)

When two `replace` fragments target the same section within a short time window
(same day, different authors), the script flags it:

```json
{
  "target": "auth-service",
  "section": "token-management",
  "hasConflicts": true,
  "conflictingFragments": [
    "fyang/20260614-1430-auth-token.md",
    "jsmith/20260614-1445-auth-token.md"
  ]
}
```

### Resolution (by the LLM at read-time)

The LLM sees the conflict flag and:
1. Reads both fragments
2. Cross-references with raw sources and actual code
3. Determines which is correct
4. Writes a `correct` fragment resolving the contradiction
5. Notifies the developer: "Found conflicting info about X — resolved based on Y"

### Human Resolution (if AI can't determine)

If the LLM cannot resolve (both fragments cite different valid sources):
- Flags to developer: "Conflicting fragments — please clarify"
- The developer tells the LLM which is correct
- LLM writes the `correct` fragment

---

## Scaling

The manifest-based approach works well up to ~500 fragments. Beyond that:

| Fragment Count | Strategy |
|---|---|
| < 200 | Manifest + direct fragment reading |
| 200–1000 | Synthesis fragments reduce read load; search-wiki.ps1 for discovery |
| 1000+ | Dedicated search tool (qmd, MCP search server, or similar) |

Synthesis fragments are the natural scaling mechanism — they pre-compile AI understanding
so future sessions don't need to re-read hundreds of raw fragments.

---

## Conventions

### Fragment Content

- Start with a clear one-line statement after frontmatter
- Use bullet points over prose
- Cite raw sources: `[↗ raw/path/to/source.md]`
- Keep fragments focused — one topic/section per fragment
- Include enough context that the fragment is self-understandable

### Tags

Freeform tags in frontmatter for categorization:
- Service/component names: `authentication`, `notification-service`
- Technical areas: `jwt`, `redis`, `api-gateway`
- Categories: `security`, `performance`, `architecture`

### Wikilinks

Use `[[target-name]]` in fragment content to cross-reference other targets.
The compilation script resolves these to relative links in assembled pages.

---

## Scripts

### `scripts/compile-wiki.ps1`

Reads all fragments, produces manifest + mechanical assembly in `.compiled/`.
Run at session start and after writing new fragments.

```powershell
pwsh scripts/compile-wiki.ps1
```

### `scripts/search-wiki.ps1`

Keyword search over all fragment files and compiled pages.

```powershell
pwsh scripts/search-wiki.ps1 "keyword1 keyword2" -Top 10
```
