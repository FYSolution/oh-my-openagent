---
type: guide
target: usage-setup
author: felix
created: 2026-06-25T18:30
status: active
---

# Oh-My-OpenAgent: Usage & Setup Guide

## Overview

Oh-my-openagent is a multi-model agent orchestration plugin for OpenCode. It transforms a single AI agent into a coordinated development team with 11 specialized agents, 53+ lifecycle hooks, and automatic model routing across providers.

## Prerequisites

| Component       | Required Version | Purpose                                   |
| --------------- | ---------------- | ----------------------------------------- |
| Bun             | >= 1.3.12        | Runtime (bunx for CLI invocation)         |
| OpenCode        | >= 1.4.0         | Host AI coding agent (terminal-based TUI) |
| Node.js         | >= 18            | Fallback when Bun unavailable             |
| Git             | latest           | Version control                           |
| GitHub CLI (gh) | latest           | GitHub automation (optional)              |

## Installation (Windows)

### Step 1: Install Bun

```powershell
# Option A: Official PowerShell installer
irm bun.sh/install.ps1 | iex

# Option B: WinGet
winget install Oven-sh.Bun

# Option C: npm (if Node.js available)
npm install -g bun
```

### Step 2: Install OpenCode

See https://opencode.ai/docs for the official installer. Verify:

```cmd
opencode --version
# Should show >= 1.4.0
```

### Step 3: Install oh-my-openagent

```cmd
bunx oh-my-openagent install
```

Interactive TUI walks through provider subscriptions. For non-interactive with Copilot:

```cmd
bunx oh-my-openagent install --no-tui --platform=opencode --copilot=yes
```

### Step 4: Authenticate Providers

#### GitHub Copilot (recommended — one subscription, many models)

```cmd
opencode auth login
# Select GitHub Copilot provider -> complete OAuth in browser
```

After auth, refresh models:

```cmd
opencode models --refresh
```

Expected output includes `github-copilot/claude-opus-4.x`, `github-copilot/gpt-5.x`, `github-copilot/gemini-3.x-pro-preview`, etc.

#### GitHub CLI (for GitHub automation features)

```cmd
gh auth login
# Select GitHub.com -> HTTPS -> Login with web browser
```

### Step 5: Verify

```cmd
bunx oh-my-openagent doctor
```

Should show "System OK". Common issues:

| Issue                        | Fix                                                          |
| ---------------------------- | ------------------------------------------------------------ |
| AST-Grep unavailable         | `npm install -g @ast-grep/cli`                               |
| GitHub CLI not authenticated | `gh auth login`                                              |
| Model cache not found        | `opencode models --refresh`                                  |
| Bun not available (warning)  | Reinstall Bun or restart terminal; Node fallback still works |

## Launching for Code Analysis

### Interactive TUI (recommended)

```cmd
cd <your-project-directory>
opencode
```

Then type commands inside OpenCode:

| Intent                   | Command                                     |
| ------------------------ | ------------------------------------------- |
| Deep autonomous analysis | `ultrawork analyze the architecture`        |
| Quick search             | `search for authentication logic`           |
| Strategic planning       | Press **Tab** (Prometheus mode)             |
| Specific analysis        | `analyze find all security vulnerabilities` |

### Non-interactive (single-shot)

```cmd
bunx oh-my-opencode run "analyze the architecture of this project"
```

### Inside VS Code

Open VS Code integrated terminal (`Ctrl+``), then run `opencode` from there. It works fully inside VS Code's terminal panel.

## Provider Priority & Model Routing

Oh-my-openagent automatically routes tasks to the best available model per agent:

```
Native API keys > GitHub Copilot > OpenCode Zen > Z.ai > Kimi > Bailian > MiniMax > Vercel
```

With GitHub Copilot subscription alone, you get access to:

- Claude Opus 4.5–4.8 (Anthropic via Copilot)
- Claude Sonnet 4.5–4.6
- GPT-5, GPT-5.4, GPT-5.5 (OpenAI via Copilot)
- Gemini 3.1 Pro Preview (Google via Copilot)

No separate API keys needed when routing through Copilot.

## Configuration

| File            | Scope           | Location                                   |
| --------------- | --------------- | ------------------------------------------ |
| User config     | All projects    | `~/.config/opencode/oh-my-openagent.jsonc` |
| Project config  | This project    | `.opencode/oh-my-openagent.jsonc`          |
| OpenCode config | OpenCode itself | `~/.config/opencode/opencode.json`         |

### Disabling Providers

```jsonc
// oh-my-openagent.jsonc
{
  "disabled_providers": ["github-copilot"], // excludes Copilot from fallback chains
}
```

### Disabling MCPs

```jsonc
{
  "disabled_mcps": ["arxiv", "grep_app"], // disable specific built-in MCPs
}
```

## Agent Architecture (11 agents)

| Agent             | Role                                   | Model Preference  |
| ----------------- | -------------------------------------- | ----------------- |
| Sisyphus          | Main orchestrator, plans and delegates | Claude Opus       |
| Hephaestus        | Hands-on implementation                | GPT-5.5 / Claude  |
| Prometheus        | Strategic planning (interview mode)    | Claude Opus       |
| Atlas             | Todo orchestration and execution       | Claude / GPT      |
| Oracle            | Architecture consultation              | GPT-5.5           |
| Librarian         | Documentation/code search              | Lightweight model |
| Explore           | Fast codebase grep                     | Lightweight model |
| Metis             | Wisdom/analysis                        | Claude            |
| Momus             | Critical review                        | Claude            |
| Multimodal-Looker | Visual/screenshot analysis             | Gemini            |
| Sisyphus-Junior   | Sub-delegation                         | Follows parent    |

## Key Features

- **IntentGate keyword detection**: Type `ultrawork`, `search`, `analyze`, or `team` to trigger mode-specific behavior
- **Hashline edit**: Content-hash verified edits (rejects stale changes)
- **3-tier MCP system**: Built-in (websearch, context7, grep_app) + Claude Code `.mcp.json` + skill-embedded
- **Team Mode**: Parallel multi-agent coordination (off by default; enable via `team_mode.enabled`)
- **Model fallback**: Per-agent chains automatically try next provider on failure
- **Runtime fallback**: Reactive error recovery when a provider fails mid-session

## Troubleshooting

| Problem                      | Solution                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------- |
| "bun is not available"       | Node fallback works; fix with `irm bun.sh/install.ps1 \| iex` + restart terminal |
| "opencode unknown" in doctor | OpenCode not in PATH or version detection issue; non-blocking                    |
| Models list empty            | Run `opencode auth login` then `opencode models --refresh`                       |
| Plugin not loading           | Check `opencode.json` has `"oh-my-openagent"` in the `plugin` array              |
| Copilot models not showing   | Need `opencode auth login` with Copilot provider (separate from `gh auth login`) |
