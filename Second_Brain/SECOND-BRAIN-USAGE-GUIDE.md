# Second Brain — Usage Guide (Fragment Architecture)

## What Is This?

The **Second Brain** is a persistent, LLM-maintained project wiki that lives alongside your code.
It automatically captures, organizes, and surfaces project knowledge so that every future coding
session benefits from everything the team has learned.

### Key Design Properties

- **Zero merge conflicts** — each developer writes only to their own folder
- **AI synthesis** — the LLM intelligently combines knowledge from all developers
- **Full history** — nothing is ever overwritten; knowledge evolution is traceable
- **No manual coordination** — work independently, knowledge merges automatically

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         YOUR WORKFLOW                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────┐     ┌──────────────────────┐     ┌─────────────────────┐  │
│  │  Human    │     │  Copilot (LLM)       │     │  Second Brain       │  │
│  │           │     │                      │     │                     │  │
│  │ • Code    │────▶│ • Compiles fragments │────▶│  COMMITTED:         │  │
│  │ • Design  │     │   at session start   │     │  fragments/{user}/  │  │
│  │ • Review  │     │ • Synthesizes AI     │     │  log/{user}/        │  │
│  │ • Drop    │     │   understanding      │     │  journal/{user}/    │  │
│  │   docs    │     │ • Writes new         │     │                     │  │
│  │           │     │   fragments after     │     │  GITIGNORED:        │  │
│  │           │     │   each task           │     │  .compiled/         │  │
│  └──────────┘     └──────────────────────┘     └─────────────────────┘  │
│       │                                                ▲                  │
│       │           ┌───────────────────┐                │                  │
│       └──────────▶│  Raw Sources      │────────────────┘                  │
│                   │  (raw/)           │  ingested as fragments             │
│                   └───────────────────┘                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

### The Three Layers

| Layer         | Path                     | Who Owns It    | Purpose                                                    |
| ------------- | ------------------------ | -------------- | ---------------------------------------------------------- |
| **Raw**       | `raw/`                   | You (human)    | Immutable source documents                                 |
| **Fragments** | `wiki/fragments/{user}/` | LLM (per-user) | Atomic knowledge units — the source of truth               |
| **Compiled**  | `wiki/.compiled/`        | LLM (local)    | AI-synthesized readable pages — generated, never committed |
| **Schema**    | `SCHEMA.md`              | Team           | Rules that tell the LLM how to maintain the wiki           |

---

## Why Zero Conflicts?

Each developer's LLM writes ONLY to:

- `wiki/fragments/{your-username}/`
- `wiki/log/{your-username}/`
- `wiki/journal/{your-username}/`
- `raw/code-updates/{your-username}-*.md`

**Git never produces merge conflicts on new file creation in different paths.**

When you pull other developers' fragments, the LLM compiles them locally into a unified view. No shared mutable files exist.

---

## Automated Behaviors (What Copilot Does For You)

### 1. Session Start — Compile + Context Load

Every time you open a chat, Copilot automatically:

1. Runs `scripts/compile-wiki.ps1` (< 1 second)
2. Reads the compiled manifest to understand available knowledge
3. Reads your recent log for continuity with past sessions
4. Scans other users' recent logs for team awareness
5. Synthesizes relevant knowledge intelligently (not just concatenation)
6. Scans `raw/` for un-ingested documents

### 2. Task End — Write Fragments

After every task that produces knowledge, Copilot automatically:

- Creates fragment(s) in `wiki/fragments/{user}/` capturing new knowledge
- Writes code-update report to `raw/code-updates/{user}-YYYY-MM-DD.md`
- Updates your daily journal at `wiki/journal/{user}/YYYY-MM-DD.md`
- Appends to your operation log at `wiki/log/{user}/YYYY-MM-DD.md`
- Runs `compile-wiki.ps1` to refresh local compiled view

**You don't need to ask.** This happens as the final step of every task.

### 3. AI Synthesis

The LLM performs intelligent synthesis (not raw concatenation):

- Reads all fragments for a topic from all developers
- Identifies the latest authoritative information
- Resolves contradictions intelligently
- Considers authorship, recency, and source citations
- Produces coherent understanding (not raw dump)
- Optionally persists synthesis as a `type: synthesis` fragment for future sessions

### 4. Document Ingestion

When you add documents to `raw/` and confirm ingestion:

- Creates source summary fragment(s) in your fragments folder
- Creates entity/concept fragments for affected topics
- Flags contradictions via `action: correct` fragments
- All traceable via source citations

---

## Daily Workflow

### For Individual Developers

1. **Start chat** — Copilot compiles and loads context automatically
2. **Code as normal** — ask questions, fix bugs, implement features
3. **End task** — Copilot writes fragments automatically
4. **Commit & push** — only your own fragment files are changed (zero conflict risk)
5. **Pull** — get teammates' fragments; next session will compile them

### For Teams

- Work independently — no coordination needed
- Push/pull freely — fragments in separate folders never conflict
- Knowledge accumulates — every developer's insights benefit the whole team
- Contradictions are detected and flagged automatically
- No "merge conflict resolution meetings" ever again

---

## Reading the Wiki Without the LLM

Need to browse knowledge without starting a Copilot session?

```powershell
# Generate readable compiled pages locally
pwsh scripts/compile-wiki.ps1

# Then browse wiki/.compiled/ in any editor/browser
```

The compiled output is a **mechanical assembly** (grouped by topic, sorted by time).
For AI-quality synthesis, use the LLM — that's what it's for.

---

## Fragment Examples

### Entity Fragment (recording service state)

```markdown
---
type: entity
target: auth-service
section: token-management
created: 2026-06-14T09:30
author: fyang
action: replace
sources: [raw/design/auth-v3.md]
tags: [authentication, jwt]
---

JWT expiry set to 30 minutes. Refresh token rotation enabled.
Tokens stored in HttpOnly cookies to prevent XSS access.
Configuration in appsettings.Production.json.
```

### Lesson Fragment (accumulates, never overwrites)

```markdown
---
type: lesson
target: lessons
section: authentication
created: 2026-06-14T10:00
author: fyang
action: append
tags: [security, jwt]
---

Never store JWT in localStorage — use HttpOnly cookies.
localStorage is accessible to any script on the page (XSS vulnerable).
```

### Correction Fragment (fixing wrong info)

```markdown
---
type: entity
target: auth-service
section: token-management
created: 2026-06-15T14:00
author: jsmith
action: correct
supersedes: fyang/20260614-0930-auth-token-config.md
---

CORRECTION: JWT expiry is 15 minutes in production, not 30.
Verified in appsettings.Production.json line 42.
The 30-minute value is only for development environment.
```

---

## FAQ

**Q: Where do I read the current project overview?**
A: `wiki/.compiled/overview.md` — regenerated from fragments each session.

**Q: What if two developers write conflicting info?**
A: The compile script flags it. The next LLM session detects and resolves it by writing a `correct` fragment.

**Q: Does this scale?**
A: Yes. Synthesis fragments pre-compile AI understanding, so future sessions don't need to re-read hundreds of raw fragments. See SCHEMA §Scaling.

**Q: What if I need to read the wiki on GitHub (web UI)?**
A: Fragments are committed and readable directly. Or set up a CI job that runs `compile-wiki.ps1` and commits to a `wiki-compiled` branch.
