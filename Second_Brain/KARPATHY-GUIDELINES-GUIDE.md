# Karpathy Guidelines — Usage Guide

## What Is This?

The **Karpathy Guidelines** is a behavioral ruleset applied to every file in the project (`applyTo: "**"`). It governs **how** Copilot writes and reviews code — preventing common LLM mistakes like over-engineering, silent assumptions, and scope creep.

It lives at `.github/instructions/karpathy-guidelines.instructions.md` and is automatically loaded by VS Code Copilot for every interaction.

---

## The Four Principles

### 1. Think Before Coding

> Don't assume. Don't hide confusion. Surface tradeoffs.

**What it does for you:**

- Copilot states its assumptions explicitly before writing code
- If your request is ambiguous, it asks instead of guessing wrong
- If a simpler approach exists, it tells you — even if you didn't ask
- **Second Brain integration:** Before implementing business logic, Copilot checks `Second_Brain/wiki/` to verify how the system actually works (statuses, flows, permissions) rather than inventing behavior

**Daily impact:**

- Fewer bugs from misunderstood requirements
- No more "why did it add this?" surprises
- Domain rules are verified against documented truth, not hallucinated

---

### 2. Simplicity First

> Minimum code that solves the problem. Nothing speculative.

**What it does for you:**

- No features you didn't ask for
- No abstractions wrapping code that's used once
- No "future-proofing" that adds complexity today
- No error handling for scenarios that can't happen
- If 200 lines could be 50, Copilot rewrites it shorter

**Daily impact:**

- PRs are smaller and easier to review
- Less code = fewer bugs = less maintenance
- New team members understand the code faster

---

### 3. Surgical Changes

> Touch only what you must. Clean up only your own mess.

**What it does for you:**

- Copilot won't "improve" code near your change
- Won't refactor working code you didn't ask about
- Matches existing code style (even if it disagrees)
- Removes only imports/variables that **its own changes** made unused
- Leaves pre-existing dead code alone unless you ask

**Daily impact:**

- Git diffs are clean — reviewers see only what matters
- No accidental regressions from "helpful" refactors
- Existing tests stay valid

---

### 4. Goal-Driven Execution

> Define success criteria. Loop until verified.

**What it does for you:**

- Every task starts with clear success criteria
- Multi-step tasks get a brief plan with verification checkpoints
- Every changed line traces directly to your request
- **Second Brain integration:** A task is NOT considered complete until the wiki is updated. This is a completion criterion — same as committing code.

**Daily impact:**

- Tasks don't drift into unrelated changes
- You can verify completion against stated goals
- Knowledge from every task is captured permanently

---

## How It Works With Second Brain

The two systems are complementary:

| Aspect      | Karpathy Guidelines               | Second Brain                        |
| ----------- | --------------------------------- | ----------------------------------- |
| **Scope**   | How code is written               | What knowledge is retained          |
| **Trigger** | Every interaction (always active) | Task completion + explicit commands |
| **Purpose** | Prevent mistakes                  | Compound knowledge                  |
| **File**    | `.github/instructions/`           | `Second_Brain/`                     |

### Integration Points

```
┌─────────────────────────────────────────────────────────┐
│                   Karpathy Guidelines                     │
│              (active on every interaction)                │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  Rule 1: "Think Before Coding"                           │
│  ────────────────────────────                            │
│  Before writing business logic:                          │
│  → Check Second_Brain/wiki/ for documented behavior      │
│  → Verify status flows, permissions, entity behavior     │
│  → Don't invent domain rules — look them up              │
│                                                           │
│  Rule 4: "Goal-Driven Execution"                         │
│  ────────────────────────────────                        │
│  Task completion criteria includes:                      │
│  → Wiki log entry written                                │
│  → Relevant entity/concept pages updated                 │
│  → Index regenerated                                     │
│  → This is NOT optional — it's part of "done"            │
│                                                           │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                     Second Brain                          │
│               (persistent project wiki)                   │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  Feeds INTO Karpathy Rule 1:                             │
│  → wiki/.compiled/entities/ — how each service works     │
│  → wiki/.compiled/concepts/ — patterns, auth, workflows  │
│  → wiki/.compiled/lessons.md — mistakes to avoid         │
│                                                           │
│  Fed BY Karpathy Rule 4:                                 │
│  → Every completed task updates the wiki                 │
│  → Journal captures daily decisions                      │
│  → Entity pages stay current with code changes           │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

### The Feedback Loop

1. **Code task begins** → Karpathy Rule 1 says "check the wiki first"
2. **Copilot reads wiki** → Understands domain rules before writing code
3. **Code is written** → Karpathy Rules 2-3 keep it minimal and surgical
4. **Task completes** → Karpathy Rule 4 requires wiki update
5. **Wiki gets richer** → Next session benefits from accumulated knowledge

This creates a **compounding knowledge loop** — every session makes the next one better.

---

## Practical Examples

### Bug Fix Scenario

Without guidelines:

```
You: "Fix bug 61449 — Draft Appeal Decision auto-saves without confirmation"
Copilot: *writes a fix, refactors 3 adjacent methods, adds generic auto-save framework*
```

With Karpathy Guidelines + Second Brain:

```
You: "Fix bug 61449 — Draft Appeal Decision auto-saves without confirmation"
Copilot:
  1. Checks wiki/.compiled/concepts/bug-fixes.md → sees pattern of similar fixes
  2. Checks wiki/.compiled/entities/appeal-decision-service.md → understands the service
  3. States assumptions: "The fix should follow the temp-status pattern used for
     Deficiency Letters (per wiki/.compiled/sources/issue-determination-temp-status)"
  4. Makes ONE surgical change to the specific auto-save logic
  5. Updates wiki: bug-fixes.md + appeal-decision-service.md + log entry
```

### Design Question Scenario

```
You: "How does the claim status workflow work?"
Copilot:
  1. Reads wiki/.compiled/concepts/claim-workflow.md (Karpathy Rule 1 — check wiki first)
  2. Presents synthesized answer with citations
  3. Offers: "Want me to verify against current code?"
  4. Does NOT launch code searches until asked (Simplicity First)
```

### New Feature Scenario

```
You: "Add email notification when appeal is submitted"
Copilot:
  1. Checks wiki/.compiled/entities/notification-service.md → existing template patterns
  2. Checks wiki/.compiled/concepts/email-templates.md → EM01-EM12 conventions
  3. States: "I'll follow the existing EM template pattern. The new template
     would be EM13. Shall I proceed?"
  4. Implements ONLY the requested notification (nothing extra)
  5. Updates: notification-service.md, email-templates.md, journal, log
```

---

## Configuration

The guidelines file is at:

```
.github/instructions/karpathy-guidelines.instructions.md
```

The YAML frontmatter `applyTo: "**"` means it applies to **all files** in the workspace — every language, every folder. You don't need to configure anything.

### Customizing

You can adjust the rules by editing the file directly. The four sections are independent — you could relax one without affecting others. But the Second Brain integration points (Rule 1 wiki-check and Rule 4 completion criterion) should stay intact for the knowledge loop to work.

---

## Quick Reference

| Situation                       | Guideline             | What Copilot Does                       |
| ------------------------------- | --------------------- | --------------------------------------- |
| Ambiguous request               | Rule 1                | Asks for clarification                  |
| Business logic needed           | Rule 1 + Second Brain | Checks wiki before coding               |
| Could be simpler                | Rule 2                | Rewrites shorter                        |
| Adjacent code "could be better" | Rule 3                | Leaves it alone                         |
| Task finished                   | Rule 4 + Second Brain | Updates wiki automatically              |
| Contradicts wiki                | Rule 1                | Flags the contradiction                 |
| Multiple approaches possible    | Rule 1                | Presents options, doesn't pick silently |

---

## Summary

The Karpathy Guidelines ensure Copilot behaves like a **disciplined senior developer** — asking before assuming, writing minimal code, making clean diffs, and documenting what was done. Combined with Second Brain, it creates a system where:

- Every session starts with full project context
- Every change is minimal and traceable
- Every task leaves the knowledge base richer
- Mistakes are recorded so they're never repeated
