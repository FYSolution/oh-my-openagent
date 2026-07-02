import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { freshnessOf } from "./freshness";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const ANCHOR = "test-support/second-brain-fixtures/basic/src/sample.ts#L1-L3";
const NOW = new Date(2026, 6, 1, 12, 0, 0);

describe("freshnessOf", () => {
  test("#given a recent last_verified #then FRESH with default trust", () => {
    const fresh = freshnessOf({ type: "entity", last_verified: "2026-06-28" }, { repoRoot: REPO_ROOT, now: NOW });
    expect(fresh.state).toBe("FRESH");
    expect(fresh.trust).toBe("curated");
  });

  test("#given an age between ttl and 3x ttl #then AGING", () => {
    const aging = freshnessOf({ type: "concept", created: "2026-01-15T10:00" }, { repoRoot: REPO_ROOT, now: NOW });
    expect(aging.state).toBe("AGING");
  });

  test("#given an age beyond 3x ttl #then STALE", () => {
    const stale = freshnessOf({ type: "source", created: "2025-06-01T10:00" }, { repoRoot: REPO_ROOT, now: NOW });
    expect(stale.state).toBe("STALE");
  });

  test("#given a mismatched anchor hash #then DRIFTED with a detailed drift reason", () => {
    const drift = freshnessOf(
      { type: "analysis", last_verified: "2026-06-29", code_anchors: [`${ANCHOR}@deadbeef`] },
      { repoRoot: REPO_ROOT, now: NOW },
    );
    expect(drift.state).toBe("DRIFTED");
    expect(drift.drift).toBe(`mismatch: ${ANCHOR}`);
  });

  test("#given a matching anchor hash #then it is not drifted", () => {
    const ok = freshnessOf(
      { type: "analysis", last_verified: "2026-06-29", code_anchors: [`${ANCHOR}@8b041f22`] },
      { repoRoot: REPO_ROOT, now: NOW },
    );
    expect(ok.state).toBe("FRESH");
    expect(ok.drift).toBeNull();
  });

  test("#given no dates #then UNKNOWN", () => {
    const unknown = freshnessOf({ type: "entity" }, { repoRoot: REPO_ROOT, now: NOW });
    expect(unknown.state).toBe("UNKNOWN");
  });
});
