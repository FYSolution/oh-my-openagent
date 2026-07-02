import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeAnchorHash } from "./anchor-hash";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const FIXTURE = "test-support/second-brain-fixtures/basic";

describe("computeAnchorHash", () => {
  test("#given fixture source #when L1-L3 #then matches the pwsh golden hash", () => {
    // given / when
    const hash = computeAnchorHash(REPO_ROOT, `${FIXTURE}/src/sample.ts#L1-L3`);
    // then
    expect(hash).toBe("8b041f22");
  });

  test("#given a spec without a line range #then SPEC", () => {
    expect(computeAnchorHash(REPO_ROOT, "no-range.ts")).toBe("SPEC");
  });

  test("#given a missing file #then MISSING", () => {
    expect(computeAnchorHash(REPO_ROOT, "nope/missing.ts#L1-L2")).toBe("MISSING");
  });

  test("#given an out-of-bounds range #then RANGE", () => {
    expect(computeAnchorHash(REPO_ROOT, `${FIXTURE}/src/sample.ts#L1-L9`)).toBe("RANGE");
  });

  test("#given CRLF endings and a BOM #then the hash equals the LF/no-BOM hash", () => {
    // given — take the real fixture bytes and re-encode them two ways
    const reference = computeAnchorHash(REPO_ROOT, `${FIXTURE}/src/sample.ts#L1-L3`);
    const source = readFileSync(join(REPO_ROOT, FIXTURE, "src", "sample.ts"), "utf8").replace(/\r\n/g, "\n");
    const dir = mkdtempSync(join(tmpdir(), "sb-anchor-"));
    writeFileSync(join(dir, "lf.ts"), source);
    writeFileSync(join(dir, "crlf.ts"), `\uFEFF${source.replace(/\n/g, "\r\n")}`);
    // when
    const lf = computeAnchorHash(dir, "lf.ts#L1-L3");
    const crlf = computeAnchorHash(dir, "crlf.ts#L1-L3");
    // then
    expect(lf).toBe(reference);
    expect(crlf).toBe(reference);
  });
});
