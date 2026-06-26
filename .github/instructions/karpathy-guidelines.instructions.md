---
applyTo: "**"
---

# Karpathy Guidelines

Behavioral guidelines to reduce common LLM coding mistakes.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.
- For business logic, status flows, or domain rules — consult `Second_Brain/wiki/` before assuming behavior. Verify design intent against documented concepts/entities before writing or reviewing code.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.
- **Exception:** `Second_Brain/` wiki updates are NOT "adjacent changes" — they are a required deliverable of every code task (per `copilot-instructions.md`). Creating/editing wiki markdown files is part of the task scope, not an "improvement".
