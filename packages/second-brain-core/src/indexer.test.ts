import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { loadFragments } from "./fragment-loader";
import { buildManifest } from "./indexer";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const FIXTURE = join(REPO_ROOT, "test-support/second-brain-fixtures/basic");
const SB = join(FIXTURE, "Second_Brain");
const NOW = new Date(2026, 6, 1, 16, 7, 10);

const manifest = buildManifest(loadFragments(SB), { repoRoot: FIXTURE, now: NOW });

describe("buildManifest", () => {
  test("#then it counts fragments, lessons and decisions", () => {
    expect(manifest.totalFragments).toBe(8);
    expect(manifest.lessons.length).toBe(1);
    expect(manifest.decisions.length).toBe(1);
  });

  test("#then widget flags the same-day multi-author conflict", () => {
    expect(manifest.targets.widget.hasConflicts).toBe(true);
    expect(manifest.targets.widget.authors).toEqual(["bob", "alice"]);
  });

  test("#then gizmo aggregates the anchor drift", () => {
    expect(manifest.targets.gizmo.freshness.worst).toBe("DRIFTED");
    expect(manifest.targets.gizmo.freshness.drifted).toBe(1);
  });

  test("#then needsVerification is ordered drift-first then stale", () => {
    expect(manifest.needsVerification.map((entry) => entry.state)).toEqual(["DRIFTED", "STALE"]);
  });
});
