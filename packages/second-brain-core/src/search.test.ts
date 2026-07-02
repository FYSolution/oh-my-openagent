import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { searchWiki } from "./search";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const SB = join(REPO_ROOT, "test-support/second-brain-fixtures/basic/Second_Brain");
const NOW = new Date(2026, 6, 1, 16, 7, 10);

describe("searchWiki", () => {
  test("#given a single keyword #then it returns ranked markdown files", () => {
    const results = searchWiki(SB, "widget", { now: NOW });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((result) => result.path.endsWith(".md"))).toBe(true);
  });

  test("#given an AND query #then only files containing every keyword match", () => {
    const results = searchWiki(SB, "gizmo internals", { now: NOW });
    expect(results.length).toBeGreaterThan(0);
    for (const result of results) expect(result.path).toContain("gizmo");
  });

  test("#given no match #then it returns empty", () => {
    expect(searchWiki(SB, "nonexistentkeywordxyz", { now: NOW })).toEqual([]);
  });

  test("#given a top limit #then results are capped", () => {
    const results = searchWiki(SB, "the", { now: NOW, top: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  test("#given a folder = author #then search is restricted to that author's fragments", () => {
    const results = searchWiki(SB, "gizmo", { now: NOW, folder: "alice" });
    expect(results.length).toBeGreaterThan(0);
    for (const result of results) expect(result.path.startsWith("fragments/alice/")).toBe(true);
  });

  test("#given a .compiled copy and a README #then only committed fragments are searched", () => {
    const root = mkdtempSync(join(tmpdir(), "sb-search-"));
    try {
      const secondBrain = join(root, "Second_Brain");
      const fragDir = join(secondBrain, "wiki", "fragments", "felix");
      mkdirSync(fragDir, { recursive: true });
      writeFileSync(join(fragDir, "20260101-0000-thing.md"), "---\ntype: concept\ntarget: thing\n---\nuniquekw content\n");
      writeFileSync(join(fragDir, "README.md"), "uniquekw in readme\n");
      const compiledDir = join(secondBrain, "wiki", ".compiled", "concepts");
      mkdirSync(compiledDir, { recursive: true });
      writeFileSync(join(compiledDir, "thing.md"), "# Thing\n\nuniquekw content\n");

      const results = searchWiki(secondBrain, "uniquekw", { now: NOW });

      expect(results.map((result) => result.path)).toEqual(["fragments/felix/20260101-0000-thing.md"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("#given AND matches nothing #then it falls back to OR on the matched keywords", () => {
    // "gizmo" exists in fixtures; "zzznomatch" does not, so strict AND is empty.
    const results = searchWiki(SB, "gizmo zzznomatch", { now: NOW });
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((result) => result.path.includes("gizmo-internals"))).toBe(true);
    expect(results.some((result) => result.path.includes("gizmo-drift"))).toBe(true);
  });

  test("#given equal body hits #then a target/tag match outranks a body-only match", () => {
    const root = mkdtempSync(join(tmpdir(), "sb-weight-"));
    try {
      const secondBrain = join(root, "Second_Brain");
      const fragDir = join(secondBrain, "wiki", "fragments", "felix");
      mkdirSync(fragDir, { recursive: true });
      writeFileSync(join(fragDir, "20260101-0000-plain.md"), "---\ntype: concept\ntarget: plain\ntags: [misc]\n---\nshared alpha content\n");
      writeFileSync(
        join(fragDir, "20260101-0100-tagged.md"),
        "---\ntype: concept\ntarget: alpha\ntags: [alpha, memory]\n---\nshared alpha content\n",
      );

      const results = searchWiki(secondBrain, "alpha", { now: NOW });

      expect(results.length).toBe(2);
      expect(results[0].path).toBe("fragments/felix/20260101-0100-tagged.md");
      expect(results[0].score).toBeGreaterThan(results[1].score);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
