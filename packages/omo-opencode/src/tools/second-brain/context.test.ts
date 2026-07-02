import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { selectWikiContext } from "./context";

const FIXTURE_ROOT = join(import.meta.dir, "..", "..", "..", "..", "..", "test-support", "second-brain-fixtures", "basic", "Second_Brain");

const NOW = new Date(2026, 6, 1, 16, 7, 10);

describe("selectWikiContext", () => {
  test("#given a matching query #when selecting #then returns the resolved target page", () => {
    // when
    const result = selectWikiContext(FIXTURE_ROOT, "gizmo internals", { now: NOW });

    // then
    expect(result).not.toBeNull();
    expect(result?.target).toBe("gizmo");
    expect(result?.content.length).toBeGreaterThan(0);
  });

  test("#given a query with no wiki matches #when selecting #then returns null", () => {
    // when
    const result = selectWikiContext(FIXTURE_ROOT, "zzzznomatchquery", { now: NOW });

    // then
    expect(result).toBeNull();
  });

  test("#given a small maxChars #when selecting #then truncates the content", () => {
    // when
    const result = selectWikiContext(FIXTURE_ROOT, "gizmo internals", {
      now: NOW,
      maxChars: 20,
    });

    // then
    expect(result).not.toBeNull();
    expect(result?.content).toContain("[...truncated]");
  });
});
