import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseLocalDate } from "./date-parse";
import { loadFragments } from "./fragment-loader";
import { buildManifest } from "./indexer";
import { stripBom } from "./text-lines";
import type { Manifest } from "./types";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const FIXTURE = join(REPO_ROOT, "test-support/second-brain-fixtures/basic");
const SB = join(FIXTURE, "Second_Brain");
const GOLDEN = join(FIXTURE, "golden-manifest.json");

function sortArrays(value: unknown): unknown {
  if (Array.isArray(value)) {
    const mapped = value.map(sortArrays);
    return [...mapped].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortArrays((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

// Drop the volatile `generated` field and make array order irrelevant so parity checks
// content, not filesystem enumeration order.
function normalize(manifest: Manifest): unknown {
  const clone = JSON.parse(JSON.stringify(manifest)) as Record<string, unknown>;
  delete clone.generated;
  return sortArrays(clone);
}

describe("manifest parity with compile-wiki.ps1", () => {
  test("#given the committed golden #when built in TS with now=golden.generated #then equal", () => {
    // given
    const golden = JSON.parse(stripBom(readFileSync(GOLDEN, "utf8"))) as Manifest;
    const now = parseLocalDate(golden.generated);
    expect(now).not.toBeNull();
    // when — feeding the golden's own timestamp reproduces its age-based freshness exactly
    const ts = buildManifest(loadFragments(SB), { repoRoot: FIXTURE, now: now as Date });
    // then
    expect(normalize(ts)).toEqual(normalize(golden));
  });
});
