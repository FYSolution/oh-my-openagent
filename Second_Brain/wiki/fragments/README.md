# Knowledge Fragments

Each developer's LLM writes atomic knowledge fragments here in their own subfolder:

```
wiki/fragments/{username}/{timestamp}-{topic}.md
```

## Rules

1. **Each developer writes ONLY to their own folder** — this guarantees zero merge conflicts
2. **Fragments are immutable after commit** — to update knowledge, create a new fragment with `action: replace`
3. **Fragment naming:** `YYYYMMDD-HHMM-{short-topic}.md` (e.g., `20260614-0930-auth-token-config.md`)
4. **Folder is auto-created** on first use. No manual setup needed.

## Fragment Types

| Type | Action | Purpose |
|---|---|---|
| `entity` | replace/append | Knowledge about a specific service/component |
| `concept` | replace/append | Cross-cutting patterns or architectural concepts |
| `lesson` | append | Lessons learned (always accumulate, never overwrite) |
| `decision` | append | Design decisions (history matters) |
| `source` | replace | Summary of an ingested raw document |
| `analysis` | append | Investigation results, comparisons |
| `overview` | replace | Project-level architectural state |
| `synthesis` | replace | AI-produced synthesis of multiple fragments |

## Merge Strategy by Action

- `append` — all fragments coexist, sorted chronologically
- `replace` — latest fragment wins for same target+section; older ones shown in history
- `correct` — explicitly marks older claims as wrong, with explanation
