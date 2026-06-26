---
type: overview
target: architecture
section: system-overview
created: 2026-06-25T14:53
author: felix
action: replace
sources: [AGENTS.md, packages/AGENTS.md, packages/omo-opencode/src/AGENTS.md]
tags: [architecture, overview, design, monorepo, plugin-system]
---

# oh-my-openagent — Overall Architecture Design Report

## 1. Executive Summary

oh-my-openagent (npm: `oh-my-opencode` / `oh-my-openagent`) is a **batteries-included AI agent harness plugin** that extends AI coding assistants (OpenCode and Codex CLI) with multi-model orchestration, parallel background agents, LSP/AST tools, and team coordination. It ships as a **monorepo with 37 packages** across 6 architectural roles, delivering two editions of one product:

- **Ultimate Edition** (`omo-opencode`): Full-featured OpenCode plugin with 11 agents, 53–60 lifecycle hooks, 20–39 tools, 3-tier MCP system, and Team Mode.
- **Light Edition** (`omo-codex` / lazycodex): Streamlined Codex CLI adapter with 8 components and minimal hook surface.

## 2. High-Level Architecture

```mermaid
graph TB
    subgraph "User Layer"
        OC[OpenCode IDE]
        CX[Codex CLI]
        CLI[oh-my-opencode CLI]
    end

    subgraph "Adapter Layer"
        OMO_OC[omo-opencode<br/>Ultimate Edition]
        OMO_CX[omo-codex<br/>Light Edition]
    end

    subgraph "Plugin Core"
        PI[Plugin Interface<br/>14 Hook Handlers]
        MG[Managers<br/>Background, Skill MCP, Tmux, Monitor]
        HK[Hook System<br/>5-Tier Composition]
        TL[Tool Registry<br/>18-39 Tools]
        AG[Agent System<br/>11 Agents]
    end

    subgraph "Core Packages (18)"
        UT[utils]
        MC[model-core]
        PC[prompts-core]
        RE[rules-engine]
        HC[hashline-core]
        TC[team-core]
        LC[lsp-core]
        OCC[openclaw-core]
        SK[skills-loader-core]
        MCC[mcp-client-core]
        TM[tmux-core]
        DC[delegate-core]
    end

    subgraph "MCP Layer"
        LSP_MCP[lsp-tools-mcp]
        GB_MCP[git-bash-mcp]
        LSP_D[lsp-daemon]
        T3[Tier-3 Skill MCPs]
    end

    subgraph "External Services"
        WS[Websearch MCP]
        C7[Context7 MCP]
        GA[grep.app MCP]
        CG[CodeGraph MCP]
    end

    OC --> OMO_OC
    CX --> OMO_CX
    CLI --> OMO_OC

    OMO_OC --> PI
    PI --> MG
    PI --> HK
    PI --> TL
    PI --> AG

    OMO_OC --> UT
    OMO_OC --> MC
    OMO_OC --> PC
    OMO_OC --> RE
    OMO_OC --> HC
    OMO_OC --> TC
    OMO_OC --> LC
    OMO_OC --> OCC
    OMO_OC --> SK
    OMO_OC --> MCC
    OMO_OC --> TM
    OMO_OC --> DC
    OMO_CX --> UT
    OMO_CX --> SK

    TL --> LSP_MCP
    TL --> GB_MCP
    TL --> LSP_D
    MG --> T3
    PI --> WS
    PI --> C7
    PI --> GA
    PI --> CG
```

## 3. Package Layering Architecture

The monorepo enforces a strict dependency hierarchy:

```mermaid
graph BT
    subgraph "Layer 1: Core (Pure TS, zero harness deps)"
        utils
        model-core
        prompts-core
        rules-engine
        hashline-core
        boulder-state
        telemetry-core
        lsp-core
        mcp-stdio-core
        tmux-core
        claude-code-compat-core
        skills-loader-core
        mcp-client-core
        openclaw-core
        team-core
        delegate-core
        agents-md-core
        comment-checker-core
    end

    subgraph "Layer 2: MCP (stdio servers)"
        lsp-tools-mcp
        git-bash-mcp
        lsp-daemon
    end

    subgraph "Layer 3: Skills"
        shared-skills
    end

    subgraph "Layer 4: Adapters"
        omo-opencode["omo-opencode (Ultimate)"]
        omo-codex["omo-codex (Light)"]
    end

    subgraph "Layer 5: Platform"
        platform-binaries["12 Platform Binaries"]
    end

    subgraph "Layer 6: Web"
        web["Marketing Site (Next.js)"]
    end

    lsp-tools-mcp --> lsp-core
    lsp-tools-mcp --> mcp-stdio-core
    lsp-daemon --> lsp-core
    lsp-daemon --> mcp-stdio-core
    omo-opencode --> utils
    omo-opencode --> model-core
    omo-opencode --> prompts-core
    omo-opencode --> rules-engine
    omo-opencode --> hashline-core
    omo-opencode --> boulder-state
    omo-opencode --> telemetry-core
    omo-opencode --> lsp-core
    omo-opencode --> tmux-core
    omo-opencode --> claude-code-compat-core
    omo-opencode --> skills-loader-core
    omo-opencode --> mcp-client-core
    omo-opencode --> openclaw-core
    omo-opencode --> team-core
    omo-opencode --> delegate-core
    omo-opencode --> agents-md-core
    omo-opencode --> comment-checker-core
    omo-codex --> utils
    omo-codex --> shared-skills
    platform-binaries --> omo-opencode
```

## 4. Plugin Initialization Flow

```mermaid
sequenceDiagram
    participant OC as OpenCode
    participant PM as PluginModule
    participant SP as serverPlugin()
    participant CFG as Config Pipeline
    participant MGR as Managers
    participant TOOLS as Tool Registry
    participant HOOKS as Hook System
    participant PI as Plugin Interface

    OC->>PM: require plugin
    PM->>SP: server(input, options)
    SP->>SP: installAgentSortShim()
    SP->>SP: initConfigContext()
    SP->>SP: logLegacyPluginStartupWarning()
    SP->>SP: migrateLegacyWorkspaceDirectory()
    SP->>SP: detectDuplicateOmoPlugin()
    SP->>SP: detectExternalSkillPlugin()
    SP->>SP: injectServerAuthIntoClient()
    SP->>CFG: loadPluginConfig()
    CFG-->>SP: pluginConfig (Zod-validated)
    SP->>SP: selectRuntimeSecuritySkills()
    SP->>SP: createRuntimeSkillSourceServer()
    SP->>SP: initI18n()
    SP->>SP: setAgentSortOrder()
    SP->>SP: initializeOpenClaw() [if configured]
    SP->>SP: checkTeamModeDependencies() [if enabled]
    SP->>SP: startTmuxCheck() [if enabled]
    SP->>MGR: createManagers()
    MGR-->>SP: {backgroundManager, skillMcpManager, tmuxSessionManager, configHandler, ...}
    SP->>TOOLS: createTools()
    TOOLS-->>SP: {filteredTools, mergedSkills, availableSkills}
    SP->>HOOKS: createHooks()
    HOOKS-->>SP: {session, toolGuard, transform, continuation, skill}
    SP->>PI: createPluginInterface()
    PI-->>SP: 12 hook handlers
    SP->>SP: createPluginDispose()
    SP-->>OC: HooksWithRuntimeLifecycle
```

## 5. Five-Tier Hook Composition

The hook system is the backbone of the plugin, organized into 5 tiers:

```mermaid
graph LR
    subgraph "Tier 1: Session Hooks (23)"
        SH[start-work<br/>keyword-detector<br/>rules-injector<br/>background-notification<br/>session-notification<br/>auto-update-checker<br/>preemptive-compaction<br/>runtime-fallback<br/>model-fallback<br/>atlas-hooks<br/>ralph-loop<br/>...]
    end

    subgraph "Tier 2: Tool Guard Hooks (17)"
        TG[write-existing-file-guard<br/>hashline-read-enhancer<br/>hashline-edit-diff-enhancer<br/>tool-output-truncator<br/>comment-checker<br/>json-error-recovery<br/>question-label-truncator<br/>prometheus-md-only<br/>edit-error-recovery<br/>...]
    end

    subgraph "Tier 3: Transform Hooks (4)"
        TF[compaction-context-injector<br/>compaction-todo-preserver<br/>tool-pair-validator<br/>think-mode]
    end

    subgraph "Tier 4: Continuation Hooks (7)"
        CH[todo-continuation-enforcer<br/>stop-continuation-guard<br/>delegate-task-retry<br/>auto-slash-command<br/>run-continuation<br/>...]
    end

    subgraph "Tier 5: Skill Hooks (2)"
        SK[category-skill-reminder<br/>agent-usage-reminder]
    end

    SH --> TG --> TF --> CH --> SK
```

**Team Mode adds:** +1 ToolGuard (`team-tool-gating`), +2 Transform (`team-mode-status-injector`, `team-mailbox-injector`), +4 event handlers → **60 total hooks**.

## 6. Agent Architecture

```mermaid
graph TD
    subgraph "Primary Agents (user-facing)"
        SIS[Sisyphus<br/>Main coding agent]
        HEP[Hephaestus<br/>Workspace orchestrator]
        PROM[Prometheus<br/>Documentation-only agent]
        ATL[Atlas<br/>Task planning agent]
    end

    subgraph "Subagents (delegated)"
        ORA[Oracle<br/>Code review expert]
        LIB[Librarian<br/>Knowledge retrieval]
        EXP[Explore<br/>Codebase exploration]
        MET[Metis<br/>Strategy advisor]
        MOM[Momus<br/>Devil's advocate]
        ML[Multimodal Looker<br/>Image/screenshot analysis]
        SJ[Sisyphus Junior<br/>Lightweight category runner]
    end

    subgraph "Canonical Sort Order"
        direction LR
        S1[1. Sisyphus] --> S2[2. Hephaestus] --> S3[3. Prometheus] --> S4[4. Atlas]
    end

    HEP -->|delegates via task tool| SIS
    HEP -->|delegates via task tool| ORA
    HEP -->|delegates via task tool| EXP
    HEP -->|delegates via task tool| SJ
    SIS -->|call_omo_agent| ORA
    SIS -->|call_omo_agent| LIB
    SIS -->|call_omo_agent| EXP
    ATL -->|planning| SIS
```

## 7. Configuration System

```mermaid
graph TD
    subgraph "Config Sources (closer wins)"
        PW["Project walked configs<br/>pwd-to-HOME/.opencode/oh-my-openagent.jsonc"]
        UC["User config<br/>~/.config/opencode/oh-my-openagent.jsonc"]
        DEF["Defaults<br/>Zod safeParse fills omitted fields"]
    end

    subgraph "6-Phase Config Pipeline"
        P1[Phase 1: Provider Discovery]
        P2[Phase 2: Plugin Components]
        P3[Phase 3: Agent Definitions]
        P4[Phase 4: Tool Registration]
        P5[Phase 5: MCP Setup]
        P6[Phase 6: Command Registration]
    end

    subgraph "Merge Strategy"
        DM[Deep Merge: agents, categories, claude_code]
        SU[Set Union: disabled_* arrays]
        OV[Override: all other fields]
        SEC["Security: mcp_env_allowlist (user-only)"]
    end

    PW --> |merge| UC --> |fallback| DEF
    DEF --> P1 --> P2 --> P3 --> P4 --> P5 --> P6
```

**Schema:** 32 Zod v4 schema files in `packages/omo-opencode/src/config/schema/`, auto-generated as JSON Schema at `assets/oh-my-opencode.schema.json`.

## 8. Three-Tier MCP System

```mermaid
graph TD
    subgraph "Tier 1: Built-in MCPs"
        WS[websearch<br/>Remote HTTP]
        C7[context7<br/>Remote HTTP]
        GA[grep_app<br/>Remote HTTP]
        LSP[lsp<br/>Local stdio]
        CG[codegraph<br/>Local stdio]
    end

    subgraph "Tier 2: Claude Code MCPs"
        CC[".mcp.json (project + user)<br/>env var expansion via allowlist"]
    end

    subgraph "Tier 3: Skill-Embedded MCPs"
        SM["SkillMcpManager<br/>Per-session isolation<br/>stdio + HTTP<br/>OAuth 2.0 + PKCE + DCR"]
    end

    subgraph "Loaders"
        L1[createBuiltinMcps()]
        L2[claude-code-mcp-loader]
        L3[SkillMcpManager]
    end

    L1 --> WS
    L1 --> C7
    L1 --> GA
    L1 --> LSP
    L1 --> CG
    L2 --> CC
    L3 --> SM
```

**Key invariant:** Per-session MCP isolation — Tier-3 MCP clients keyed by `${sessionID}:${skillName}:${serverName}`.

## 9. Tool System

| Category       | Tools                                                                                                            | Gate                       |
| -------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Always On (18) | `lsp_*` (6), `grep`, `glob`, `session_*` (4), `background_*` (2), `call_omo_agent`, `task`, `skill`, `skill_mcp` | None                       |
| Conditional    | `look_at`                                                                                                        | multimodal-looker enabled  |
| Conditional    | `interactive_bash`                                                                                               | tmux binary on PATH        |
| Conditional    | `task_*` (4)                                                                                                     | `experimental.task_system` |
| Conditional    | `edit` (hashline)                                                                                                | `hashline_edit: true`      |
| Conditional    | `team_*` (12)                                                                                                    | `team_mode.enabled`        |

## 10. Team Mode Architecture

```mermaid
graph TD
    subgraph "Team Coordination"
        TC[Team Config<br/>~/.omo/teams/{name}/config.json]
        TS[Team State<br/>state.json]
        MB[Mailbox<br/>mailbox/ directory]
        TL[Tasklist<br/>tasklist.jsonl]
        WT[Worktrees<br/>worktrees/ per-member git worktrees]
    end

    subgraph "Member Types"
        SA[kind: subagent_type<br/>Direct agent invocation]
        CT[kind: category<br/>Routed through sisyphus-junior]
    end

    subgraph "Eligible Agents"
        E1[sisyphus ✓]
        E2[atlas ✓]
        E3[sisyphus-junior ✓]
        E4[hephaestus ⚠️ conditional]
    end

    TC --> TS
    TC --> MB
    TC --> TL
    TC --> WT
    SA --> E1
    SA --> E2
    SA --> E3
    CT --> E3
```

**Constraints:** max 4 parallel members (configurable 1–8), max 8 total members, 3s mailbox poll interval.

## 11. Dual Fallback Systems

```mermaid
graph LR
    subgraph "Proactive: model-fallback"
        MF[chat.params hook<br/>Hardcoded chains per agent<br/>Activates BEFORE API call]
    end

    subgraph "Reactive: runtime-fallback"
        RF[session.error handler<br/>Configurable per category/agent<br/>Activates AFTER error received<br/>Retry on 429/500/502/503/504]
    end

    MF -.->|independent| RF
```

## 12. Build & Deploy Pipeline

```mermaid
graph LR
    subgraph "Build"
        B1[bun build<br/>ESM bundle]
        B2[tsc --emitDeclarationOnly<br/>.d.ts types]
        B3[bun compile<br/>12 platform binaries]
        B4[build:schema<br/>JSON Schema]
    end

    subgraph "CI (ci.yml)"
        T[Tests] --> TC2[Typecheck] --> BD[Build] --> CX_GATE[Codex Compatibility<br/>ubuntu/macos/windows]
    end

    subgraph "Publish (publish.yml)"
        PF[Preflight Trust<br/>OIDC verify] --> NP1[npm: oh-my-opencode]
        PF --> NP2[npm: oh-my-openagent]
        PF --> NP3[npm: lazycodex-ai]
        PF --> PB[Platform Binaries<br/>publish-platform.yml]
        PF --> GH[GitHub Release]
        PF --> MS[Codex Marketplace Sync<br/>code-yeongyu/lazycodex]
        PF --> MG2[Merge to master]
    end

    B1 --> BD
    B3 --> PB
```

## 13. Data Flow: Message Lifecycle

```mermaid
sequenceDiagram
    participant U as User
    participant OC as OpenCode
    participant CM as chat.message Hook
    participant KD as Keyword Detector
    participant CP as chat.params Hook
    participant MT as messages.transform
    participant ST as system.transform
    participant AG as Agent (LLM)
    participant TB as tool.execute.before
    participant TA as tool.execute.after
    participant EV as event Handler

    U->>OC: User prompt
    OC->>CM: chat.message
    CM->>KD: Classify intent (ultrawork/search/analyze/team)
    KD-->>CM: Mode-specific prompt injection
    CM-->>OC: Modified message + session setup
    OC->>CP: chat.params
    CP-->>OC: Model selection, effort, think mode
    OC->>MT: messages.transform
    MT-->>OC: Context injection, validation
    OC->>ST: system.transform
    ST-->>OC: System message transforms
    OC->>AG: Send to LLM
    AG-->>OC: Tool call request
    OC->>TB: tool.execute.before
    TB-->>OC: Guards (write-existing, hashline, rules)
    OC->>OC: Execute tool
    OC->>TA: tool.execute.after
    TA-->>OC: Post-processing (truncator, comment-checker, hashline)
    AG-->>OC: Response complete
    OC->>EV: session.idle event
    EV-->>OC: Notifications, OpenClaw dispatch, continuation
```

## 14. Security Architecture

| Layer               | Mechanism                                                         |
| ------------------- | ----------------------------------------------------------------- |
| Config isolation    | `mcp_env_allowlist` is user-only; walked configs cannot extend it |
| File safety         | `write-existing-file-guard` prevents writes without prior read    |
| Edit integrity      | Hashline `LINE#ID` content hashes validate before apply           |
| Agent containment   | Prometheus restricted to `.md` files only                         |
| MCP isolation       | Per-session client keying prevents state leakage                  |
| Auth injection      | Server auth injected into SDK client at startup                   |
| Duplicate detection | Early-exit if duplicate plugin detected                           |
| Process cleanup     | Background-agent error handlers are log-only (no force-exit)      |
| Team gating         | Tool-level access control for team operations                     |

## 15. Key Architecture Invariants

1. **Canonical agent order:** Sisyphus → Hephaestus → Prometheus → Atlas (enforced by `installAgentSortShim()`)
2. **Hashline edit + read pairing:** Every Read tagged with `LINE#ID`; edits rejected on stale hash
3. **5-tier hook composition:** Session + ToolGuard + Transform + Continuation + Skill
4. **Per-session MCP isolation:** `${sessionID}:${skillName}:${serverName}` keying
5. **Two independent fallback systems:** model-fallback (proactive) vs runtime-fallback (reactive)
6. **OpenClaw bidirectional:** Outbound dispatchers on session events; inbound daemon polls
7. **Prompt-async gate:** All `session.prompt`/`session.promptAsync` must go through shared gate

## 16. Technology Stack

| Concern            | Technology                                          |
| ------------------ | --------------------------------------------------- |
| Runtime            | Bun 1.3.12                                          |
| Language           | TypeScript (strict, ESNext)                         |
| Schema validation  | Zod v4                                              |
| Type checking      | tsgo (@typescript/native-preview)                   |
| Test framework     | Bun test (`bun:test`)                               |
| Build              | `bun build` (ESM) + `bun compile` (binaries)        |
| Module resolution  | Bundler (no path aliases except `packages/web/`)    |
| CI                 | GitHub Actions                                      |
| Package manager    | Bun workspaces                                      |
| Platform targeting | 12 binaries (darwin/linux/windows × arch × variant) |
