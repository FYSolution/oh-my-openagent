import { describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdtempSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadIndex, rebuildIndex } from "./read-through";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const FIXTURE = join(REPO_ROOT, "test-support/second-brain-fixtures/basic");
const NOW = new Date(2026, 6, 1, 16, 7, 10);

function tempSecondBrain(): string {
  const dir = mkdtempSync(join(tmpdir(), "sb-cache-"));
  cpSync(FIXTURE, join(dir, "basic"), { recursive: true });
  return join(dir, "basic", "Second_Brain");
}

describe("read-through index cache", () => {
  test("#given a rebuild #then the manifest is persisted", () => {
    const sb = tempSecondBrain();
    rebuildIndex(sb, { now: NOW });
    expect(existsSync(join(sb, "wiki", ".compiled", "_manifest.json"))).toBe(true);
  });

  test("#given a manifest newer than all fragments #then loadIndex returns it without rebuilding", () => {
    const sb = tempSecondBrain();
    const first = rebuildIndex(sb, { now: NOW });
    const manifestFile = join(sb, "wiki", ".compiled", "_manifest.json");
    const future = new Date(Date.now() + 60_000);
    utimesSync(manifestFile, future, future);
    // a different `now` would change `generated` if a rebuild happened
    const second = loadIndex(sb, { now: new Date(2000, 0, 1) });
    expect(second.generated).toBe(first.generated);
  });

  test("#given forceRebuild #then the cache is ignored", () => {
    const sb = tempSecondBrain();
    rebuildIndex(sb, { now: NOW });
    const rebuilt = loadIndex(sb, { now: new Date(2030, 0, 2, 3, 4, 5), forceRebuild: true });
    expect(rebuilt.generated).toBe("2030-01-02T03:04:05");
  });
});
