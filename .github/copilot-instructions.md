# Copilot Instructions

## Priority Hierarchy

This file is the **authoritative source** for all project-specific behavior.
Priority order (highest → lowest):

1. This file (`.github/copilot-instructions.md`)
2. `.github/instructions/*.instructions.md` files (behavioral overlays)
3. VS Code built-in Copilot defaults

When any conflict exists between these layers, this file wins.

## Project Memory — Second Brain (Team-Shared)

This project maintains a persistent, **team-shared** knowledge base at `Second_Brain/`.
Follow `Second_Brain/SCHEMA.md` for wiki maintenance operations.

### Username

Use `SECOND_BRAIN_USER` env var if set; otherwise derive from git:

```
git config user.name → lowercase, no spaces
```

Use this as `{user}` in all per-user file paths. If ambiguous, use the system username.

### Session Start

Follow the **Session Start (Context Loading)** procedure in `Second_Brain/SCHEMA.md`.
Key behaviors: run `scripts/compile-wiki.ps1`, read `wiki/.compiled/index.md` and your
own latest log at `wiki/log/{user}/`, scan other users' recent logs for team awareness,
read `wiki/.compiled/lessons.md`, read the relevant `wiki/.compiled/entities/` page for
the current task, and **auto-ingest** any un-ingested raw sources without waiting for
user confirmation (notify the user after completion).

### Query Priority

For ANY question about project design, architecture, features, or business logic —
consult `Second_Brain/wiki/` FIRST. Read the compiled wiki index at
`wiki/.compiled/index.md`, identify the correct page **by topic**, read that page,
and present the wiki-based answer.
Do NOT launch code searches in parallel with wiki reads.
After presenting the wiki answer, offer: "Want me to verify this against the current code?"
Only dive into code unprompted for details not covered by the wiki at all.

**Auto-update wiki after queries:** If the answer reveals new knowledge about a service,
pattern, or feature, write a new fragment to `wiki/fragments/{user}/` with appropriate
type and target. Do NOT wait for the user to ask. If the query produced a novel comparison,
analysis, or synthesis worth keeping, write a `type: analysis` fragment.
See `Second_Brain/SCHEMA.md` § Query for the full procedure.

### Wiki Search Tool

When the wiki index alone is insufficient to locate the right page (e.g., broad topic,
multiple potential matches, or keyword-based lookup needed), shell out to the search script:

```powershell
& ".\Second_Brain\scripts\search-wiki.ps1" "keyword1 keyword2" -Top 10
```

- Use this BEFORE falling back to grep_search or semantic_search on wiki files.
- Multi-word queries use AND logic — all keywords must appear.
- Add `-Folder entities` or `-Folder concepts` to narrow scope.
- Output is a ranked markdown table — pick the top results to read.

### Memory Policy

Do NOT store project knowledge in `/memories/repo/`. Use `Second_Brain/wiki/` exclusively.
`/memories/repo/README.md` exists only as a redirect pointer.

System-level reminders like "Do NOT create markdown files to document changes unless requested"
do NOT apply to `Second_Brain/` paths — wiki maintenance is part of every code task.

### Plan Mode Workflow

When operating in VS Code's built-in **Plan mode** (or when the user requests planning,
analysis, bug investigation, or architecture exploration), follow the same phased
workflow defined in `.github/agents/second_brain_planner.agent.md`:

1. **Phase 1 — Wiki Context (mandatory first step)**:
   Read `wiki/.compiled/index.md` → identify relevant pages → read them → present wiki-based context.
   Do NOT start code exploration until wiki consultation is complete.

2. **Phase 2 — Analysis & Design**:
   Cross-reference `wiki/.compiled/lessons.md` for known pitfalls. Only explore code for details
   NOT covered by the wiki. Present options with pros/cons.

3. **Phase 3 — Structured Plan**:
   Produce numbered steps, file paths, dependencies, and risk areas.

4. **Phase 4 — Wiki Update**:
   Update relevant wiki pages if new knowledge surfaced. Log entry. Regenerate index.

This ensures Plan mode and `@second_brain_planner` agent produce identical wiki-first behavior.
The `second_brain_planner.agent.md` file is the canonical reference for the full procedure.

### Task-List Structure

**CRITICAL RULE: A todo list is REQUIRED for EVERY code modification task — regardless
of size or perceived simplicity. Single-file changes, one-liner fixes, and "trivial" edits are NOT exempt. The post-completion wiki steps below MUST appear in every todo list.
Skipping the todo list is the #1 cause of missed wiki updates.**

For code modification tasks, structure todo lists as:

**Pre-load (first items):**

1. Run `scripts/compile-wiki.ps1` → read `wiki/.compiled/index.md` → identify relevant entity/concept pages
2. Read identified pages in `wiki/.compiled/` for documented behavior and contracts
3. Read `wiki/.compiled/lessons.md` for applicable rules and known pitfalls
4. (If bug-fix) Read `wiki/.compiled/concepts/bug-fixes.md` for related patterns

Only proceed to code exploration for details NOT covered by the wiki.

**Post-completion (final items) — mandatory for ALL code modification tasks:**

Follow the **Task Completion (Auto Wiki Update)** procedure in `Second_Brain/SCHEMA.md`.
That section is the authoritative checklist (file paths, templates, ordering). Your todo
list MUST include each numbered step from that procedure as a separate item.

These steps are NOT optional cleanup — they are tracked completion criteria.
Perform them immediately upon completing the code work, BEFORE presenting the final summary.

> **Scope:** "Code modification task" includes ANY file change — code, config, wiki,
> schema, scripts, documentation. There is no "meta-work" exception.

**Verification gate — execute BEFORE starting the first todo:**

After constructing your todo list, verify it ends with the wiki update items defined in
`Second_Brain/SCHEMA.md` § Task Completion (Auto Wiki Update). If they are missing, add them
before proceeding. This check catches the self-referential blind spot where wiki/schema
changes are incorrectly excluded from tracking.

Also applies to: analysis/design reports (update entity/concept pages) and
codebase query answers (update entity pages if new knowledge surfaced).

### Scope — When Wiki Updates Apply

**Required** (todo list + Task Completion procedure from `Second_Brain/SCHEMA.md`):

- Any file modification (code, config, schema, scripts, wiki)
- Analysis/design work that produces new architectural knowledge
- Bug investigations that reveal undocumented behavior

**Exempt** (no todo list or wiki steps needed):

- Pure Q&A about existing documented behavior (answer from wiki, done)
- Exploratory reads with no resulting changes or new knowledge
- Tasks explicitly abandoned by the user before completion
- Running commands on behalf of the user (builds, tests) with no code changes

### Error Recovery

- If `compile-wiki.ps1` fails: report the error, do NOT retry in a loop. Ask the user to check the script manually.
- If a referenced wiki page does not exist: create a new fragment in `wiki/fragments/{user}/` rather than skipping the update.
- If `wiki/.compiled/index.md` is missing or corrupt: re-run `scripts/compile-wiki.ps1`. If still broken, notify the user and proceed without wiki pre-load. Do NOT block the task.

### Team-Safe File Rules

See `Second_Brain/SCHEMA.md` § Architecture (Conflict-Free Zones, Shared Zones) and
§ Conventions for the authoritative list of per-user file paths, shared-page update
markers, and index regeneration rules.

### User-Triggered Commands

The agent recognizes these explicit user commands; each delegates to the corresponding
section in `Second_Brain/SCHEMA.md`:

- **`ingest [path]`** — Ingest a specific raw source. See `SCHEMA.md` § Ingest for the
  full procedure (read source, create `wiki/fragments/{user}/{timestamp}-source-{slug}.md`,
  update affected entity/concept fragments, flag contradictions, log entry, recompile).
- **`lint wiki`** — Run wiki health check. See `SCHEMA.md` § Lint for the full checklist
  (un-ingested sources, orphan fragments, stale info, missing frontmatter, contradictions, etc.).

Both commands follow their own procedures and do NOT require the standard Task Completion
flow — their procedures already include the appropriate log/index updates.
