import { stateRank } from "./constants";
import { byCreatedDesc } from "./ordering";
import type { EvaluatedFragment, FreshnessStateName, ManifestTarget } from "./types";

function uniqueInOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  }
  return out;
}

// Conflict = two or more `replace` fragments for the same section, created on the same
// day, by different authors.
function detectConflicts(items: EvaluatedFragment[]): boolean {
  const bySection = new Map<string, EvaluatedFragment[]>();
  for (const item of items) {
    if (item.action !== "replace") continue;
    const key = item.section ?? "";
    const bucket = bySection.get(key) ?? [];
    bucket.push(item);
    bySection.set(key, bucket);
  }
  for (const bucket of bySection.values()) {
    const authorsByDay = new Map<string, Set<string>>();
    for (const item of bucket) {
      const day = (item.created ?? "").split("T")[0];
      const authors = authorsByDay.get(day) ?? new Set<string>();
      if (item.author) authors.add(item.author);
      authorsByDay.set(day, authors);
    }
    for (const authors of authorsByDay.values()) {
      if (authors.size > 1) return true;
    }
  }
  return false;
}

export function buildTarget(type: string, items: EvaluatedFragment[]): ManifestTarget {
  const sorted = [...items].sort(byCreatedDesc);
  const authors = uniqueInOrder(sorted.map((item) => item.author).filter((author): author is string => author !== null));

  let worst: FreshnessStateName = "FRESH";
  let worstRank = 0;
  for (const item of sorted) {
    const rank = stateRank(item.freshness.state);
    if (rank > worstRank) {
      worstRank = rank;
      worst = item.freshness.state;
    }
  }

  return {
    type,
    fragmentCount: sorted.length,
    lastUpdated: sorted.length > 0 ? sorted[0].created : null,
    authors,
    hasConflicts: detectConflicts(sorted),
    hasSynthesis: sorted.some((item) => item.type === "synthesis"),
    freshness: {
      worst,
      drifted: sorted.filter((item) => item.freshness.state === "DRIFTED").length,
      stale: sorted.filter((item) => item.freshness.state === "STALE").length,
    },
    fragments: sorted.map((item) => ({
      file: item.fragment.relPath,
      section: item.section,
      action: item.action,
      created: item.created,
      author: item.author,
    })),
  };
}
