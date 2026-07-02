import { dirname } from "node:path";
import { stateBadge, stateRank, titleCase } from "./constants";
import { loadFragments } from "./fragment-loader";
import { evaluateFragments } from "./indexer";
import { byCreatedDesc } from "./ordering";
import type { EvaluatedFragment, FreshnessStateName } from "./types";

export interface ReadTargetOptions {
  now?: Date;
}

function worstState(items: EvaluatedFragment[]): FreshnessStateName {
  let worst: FreshnessStateName = "FRESH";
  let worstRank = 0;
  for (const item of items) {
    const rank = stateRank(item.freshness.state);
    if (rank > worstRank) {
      worstRank = rank;
      worst = item.freshness.state;
    }
  }
  return worst;
}

function groupBySection(items: EvaluatedFragment[]): Map<string, EvaluatedFragment[]> {
  const sections = new Map<string, EvaluatedFragment[]>();
  for (const item of items) {
    const key = item.section ?? "_root";
    const bucket = sections.get(key) ?? [];
    bucket.push(item);
    sections.set(key, bucket);
  }
  return sections;
}

// Assemble a readable target page from its fragments (newest-first, corrections first,
// latest replace as current truth with collapsed history, appends coexisting). Mirrors
// Assemble-TargetPage structurally; not byte-locked to the PowerShell page output.
export function renderTargetPage(target: string, items: EvaluatedFragment[]): string {
  const sorted = [...items].sort(byCreatedDesc);
  const authors = [...new Set(sorted.map((item) => item.author).filter((a): a is string => a !== null))];
  const out: string[] = [];
  out.push(`# ${titleCase(target)}`, "");
  out.push(
    `> Compiled from ${sorted.length} fragments by ${authors.join(", ")} | Last updated: ${sorted[0]?.created ?? ""} | Freshness: ${stateBadge(worstState(sorted))}`,
    "",
  );

  const sections = groupBySection(sorted);
  for (const name of [...sections.keys()].sort()) {
    const sectionItems = (sections.get(name) ?? []).sort(byCreatedDesc);
    if (name !== "_root") out.push(`## ${titleCase(name)}`, "");

    for (const correction of sectionItems.filter((item) => item.action === "correct")) {
      out.push(`> **Correction** (${correction.author}, ${correction.created}):`);
      out.push(`> ${correction.fragment.body.replace(/\n/g, "\n> ")}`, "");
    }

    const replaces = sectionItems.filter((item) => item.action === "replace");
    if (replaces.length > 0) {
      const latest = replaces[0];
      out.push(`<!-- latest: ${latest.author} ${latest.created} -->`, "", latest.fragment.body, "");
      const older = replaces.slice(1);
      if (older.length > 0) {
        out.push(`<details><summary>History (${older.length} prior version${older.length > 1 ? "s" : ""})</summary>`, "");
        for (const old of older) {
          out.push(`- **${old.created} (${old.author})** [superseded]`);
          const preview = old.fragment.body
            .split("\n")
            .slice(0, 2)
            .map((l) => `  ${l}`)
            .join("\n");
          out.push(`  ${preview}`, "");
        }
        out.push("</details>", "");
      }
    }

    for (const append of sectionItems.filter((item) => item.action === "append")) {
      out.push(`### [${append.created} ${append.author}]`, "", append.fragment.body, "");
    }
  }
  return out.join("\n");
}

// Render the assembled page for a single target directly from fragments. Returns null when
// the target has no non-lesson/non-decision fragments.
export function readTarget(secondBrainRoot: string, target: string, options: ReadTargetOptions = {}): string | null {
  const repoRoot = dirname(secondBrainRoot);
  const items = evaluateFragments(loadFragments(secondBrainRoot), { repoRoot, now: options.now }).filter(
    (item) => item.target === target && item.type !== "lesson" && item.type !== "decision",
  );
  if (items.length === 0) return null;
  return renderTargetPage(target, items);
}
