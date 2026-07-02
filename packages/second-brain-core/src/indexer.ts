import { defaultActionForType, stateRank } from "./constants";
import { freshnessOf } from "./freshness";
import { buildTarget } from "./manifest-target";
import type { EvaluatedFragment, Fragment, Manifest, ManifestSimpleRef, ManifestTarget, NeedsVerificationEntry } from "./types";

export interface BuildIndexOptions {
  repoRoot: string;
  now?: Date;
}

function scalar(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function evaluateFragments(fragments: Fragment[], options: BuildIndexOptions): EvaluatedFragment[] {
  const now = options.now ?? new Date();
  return fragments.map((fragment) => {
    const fm = fragment.frontmatter;
    const type = scalar(fm.type);
    return {
      fragment,
      freshness: freshnessOf(fm, { repoRoot: options.repoRoot, now }),
      type,
      target: scalar(fm.target),
      section: scalar(fm.section) ?? null,
      author: scalar(fm.author) ?? null,
      created: scalar(fm.created) ?? null,
      action: scalar(fm.action) ?? defaultActionForType(type),
    };
  });
}

function toSimpleRef(item: EvaluatedFragment): ManifestSimpleRef {
  return { file: item.fragment.relPath, section: item.section, created: item.created, author: item.author };
}

function buildNeedsVerification(evaluated: EvaluatedFragment[]): NeedsVerificationEntry[] {
  const flagged = evaluated.filter((item) => item.freshness.state === "STALE" || item.freshness.state === "DRIFTED");
  flagged.sort((a, b) => {
    const rank = stateRank(b.freshness.state) - stateRank(a.freshness.state);
    if (rank !== 0) return rank;
    if (a.fragment.relPath < b.fragment.relPath) return -1;
    if (a.fragment.relPath > b.fragment.relPath) return 1;
    return 0;
  });
  return flagged.map((item) => ({
    file: item.fragment.relPath,
    target: item.target ?? null,
    type: item.type ?? null,
    state: item.freshness.state,
    detail: item.freshness.drift
      ? `anchor drift (${item.freshness.drift})`
      : `age > TTL (${Math.round(item.freshness.ageDays ?? 0)}d / ${item.freshness.ttl}d)`,
    refDate: item.freshness.refDate,
  }));
}

function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// Port of the target-grouping / manifest block in compile-wiki.ps1. Emits the same
// _manifest.json contract so the PowerShell and TypeScript producers are interchangeable.
export function buildManifest(fragments: Fragment[], options: BuildIndexOptions): Manifest {
  const now = options.now ?? new Date();
  const evaluated = evaluateFragments(fragments, { repoRoot: options.repoRoot, now });

  const lessons: EvaluatedFragment[] = [];
  const decisions: EvaluatedFragment[] = [];
  const groups = new Map<string, { type: string; target: string; items: EvaluatedFragment[] }>();

  for (const item of evaluated) {
    if (item.type === "lesson") {
      lessons.push(item);
      continue;
    }
    if (item.type === "decision") {
      decisions.push(item);
      continue;
    }
    if (item.type && item.target) {
      const key = `${item.type}|${item.target}`;
      const group = groups.get(key) ?? { type: item.type, target: item.target, items: [] };
      group.items.push(item);
      groups.set(key, group);
    }
  }

  const targets: Record<string, ManifestTarget> = {};
  for (const group of groups.values()) {
    targets[group.target] = buildTarget(group.type, group.items);
  }

  return {
    generated: formatTimestamp(now),
    totalFragments: fragments.length,
    targets,
    lessons: lessons.map(toSimpleRef),
    decisions: decisions.map(toSimpleRef),
    needsVerification: buildNeedsVerification(evaluated),
  };
}
