import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { rebuildIndex } from "./read-through";

// R6 scaffolder: create a fresh Second_Brain/ tree (folders + minimal starter
// files) so a project gets project-memory without a human setting it up by hand.
// Pure fs + string templates, no OpenCode dependency. The runtime regenerates
// .compiled/ in TS, so the scaffold does NOT ship the PowerShell authoring
// scripts. When a Second_Brain/ (possibly an older version) already exists, it
// merges in only the pieces that are missing and never overwrites existing
// content.

export interface ScaffoldOptions {
  user?: string;
  now?: Date;
}

export interface ScaffoldResult {
  // true only when the root did not exist and was freshly created.
  created: boolean;
  // true when the root already existed and >=1 missing piece was added.
  merged: boolean;
  root: string;
  // root-relative paths of everything added during this call.
  added: string[];
}

function normalizeUser(user: string | undefined): string {
  const trimmed = (user ?? "").trim().toLowerCase().replace(/\s+/g, "-");
  return trimmed.length > 0 ? trimmed : "user";
}

function isoDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function seedFragment(user: string, now: Date): string {
  return `---
type: overview
target: getting-started
created: ${now.toISOString().slice(0, 16)}
author: ${user}
last_verified: ${isoDate(now)}
trust: curated
ttl_days: 120
tags: [second-brain, getting-started, overview]
---

# Getting Started with Second_Brain

This project now has a Second_Brain: a committed, team-shared knowledge base the
agent reads at runtime to answer questions about design, architecture, and prior
decisions before searching code.

## How it works

- Source of truth lives in \`wiki/fragments/{user}/*.md\` — small markdown notes
  with a frontmatter envelope (\`type\`, \`target\`, \`trust\`, \`ttl_days\`, ...).
- Fragments sharing a \`target\` compile into one topic page.
- \`wiki/.compiled/\` is a regenerable index (gitignored) — the runtime rebuilds
  it on demand, so you never edit it by hand.

## Add knowledge

Drop a new fragment under \`wiki/fragments/${user}/\` and give it a \`target\`
(the topic it belongs to). The next search picks it up automatically.
`;
}

function seedLog(user: string, now: Date): string {
  return `# ${isoDate(now)} — ${user}

## [00:00] init | Second_Brain scaffolded by oh-my-openagent (auto-init)
`;
}

const GITIGNORE = `# Regenerable compiled index — never committed
wiki/.compiled/
`;

function seedSchema(user: string): string {
  return `# Second_Brain Schema

Minimal project-memory contract. Fragments are the source of truth; the compiled
index under \`wiki/.compiled/\` is a regenerable cache.

## Layout

\`\`\`
Second_Brain/
├── .gitignore            # ignores wiki/.compiled/
├── SCHEMA.md             # this file
├── raw/                  # ingest sources + code-update logs
└── wiki/
    ├── fragments/{user}/ # source-of-truth markdown notes
    ├── log/{user}/       # per-user daily activity logs
    └── .compiled/        # regenerable index (do not edit)
\`\`\`

## Fragment frontmatter

\`\`\`yaml
type: overview        # overview | entity | concept | analysis | lesson | decision | source
target: my-topic      # groups fragments into one compiled page
created: 2026-07-01T12:00
author: ${user}
trust: curated        # curated | source
ttl_days: 120
tags: [example]
\`\`\`

Write fragments under \`wiki/fragments/${user}/\`; the runtime recompiles the
index automatically on the next read.
`;
}

export function scaffoldSecondBrain(secondBrainRoot: string, options: ScaffoldOptions = {}): ScaffoldResult {
  const preexisting = existsSync(secondBrainRoot);
  const user = normalizeUser(options.user);
  const now = options.now ?? new Date();
  const added: string[] = [];

  const fragmentsDir = join(secondBrainRoot, "wiki", "fragments", user);
  const logDir = join(secondBrainRoot, "wiki", "log", user);
  const rawDir = join(secondBrainRoot, "raw", "code-updates");

  for (const dir of [fragmentsDir, logDir, rawDir]) {
    ensureDir(dir, secondBrainRoot, added);
  }

  ensureFile(join(secondBrainRoot, ".gitignore"), GITIGNORE, secondBrainRoot, added);
  ensureSchema(secondBrainRoot, user, added);

  // Seed starter content only into an empty user space so an established brain
  // is never polluted with a getting-started note or an init log.
  if (!hasMarkdown(fragmentsDir)) {
    ensureFile(join(fragmentsDir, "getting-started.md"), seedFragment(user, now), secondBrainRoot, added);
  }
  if (!hasMarkdown(logDir)) {
    ensureFile(join(logDir, `${isoDate(now)}.md`), seedLog(user, now), secondBrainRoot, added);
  }

  rebuildIndex(secondBrainRoot, { now, persist: true });

  return {
    created: !preexisting,
    merged: preexisting && added.length > 0,
    root: secondBrainRoot,
    added,
  };
}

function ensureDir(dir: string, root: string, added: string[]): void {
  if (existsSync(dir)) return;
  mkdirSync(dir, { recursive: true });
  added.push(relative(root, dir));
}

function ensureFile(path: string, content: string, root: string, added: string[]): void {
  if (existsSync(path)) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
  added.push(relative(root, path));
}

// SCHEMA merge is additive by heading: a starter section is appended only when
// its heading is absent from the existing SCHEMA. Existing sections are never
// touched, honoring the never-overwrite policy.
function ensureSchema(root: string, user: string, added: string[]): void {
  const path = join(root, "SCHEMA.md");
  const seed = seedSchema(user);
  if (!existsSync(path)) {
    writeFileSync(path, seed, "utf8");
    added.push("SCHEMA.md");
    return;
  }

  const merged = mergeSchemaSections(readFileSync(path, "utf8"), seed);
  if (merged === null) return;
  writeFileSync(path, merged, "utf8");
  added.push("SCHEMA.md#sections");
}

function mergeSchemaSections(existing: string, seed: string): string | null {
  const existingHeadings = new Set(
    existing
      .split(/\r?\n/)
      .filter((line) => /^#{1,6}\s/.test(line))
      .map(normalizeHeading),
  );

  const toAppend = splitSchemaSections(seed).filter((section) => !existingHeadings.has(normalizeHeading(section.headingLine)));
  if (toAppend.length === 0) return null;

  const suffix = toAppend.map((section) => section.text.trimEnd()).join("\n\n");
  return `${existing.trimEnd()}\n\n${suffix}\n`;
}

function splitSchemaSections(text: string): { headingLine: string; text: string }[] {
  const sections: { headingLine: string; text: string }[] = [];
  let current: { headingLine: string; buf: string[] } | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (/^##\s+/.test(line)) {
      if (current) sections.push({ headingLine: current.headingLine, text: current.buf.join("\n") });
      current = { headingLine: line, buf: [line] };
    } else if (current) {
      current.buf.push(line);
    }
  }
  if (current) sections.push({ headingLine: current.headingLine, text: current.buf.join("\n") });
  return sections;
}

function normalizeHeading(line: string): string {
  return line
    .replace(/^#+\s*/, "")
    .trim()
    .toLowerCase();
}

function hasMarkdown(dir: string): boolean {
  if (!existsSync(dir)) return false;
  return readdirSync(dir).some((name) => name.toLowerCase().endsWith(".md"));
}
