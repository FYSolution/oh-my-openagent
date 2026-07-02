import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { splitContentLines } from "./text-lines";

const ANCHOR_SPEC_RE = /^(.+)#L(\d+)-L(\d+)$/;

// Canonical anchor hash: first 8 lowercase hex of SHA256 over the 1-indexed inclusive
// line range, each line TrimEnd'd, joined with LF, file read as UTF8. Byte-identical to
// Get-AnchorHash in the PowerShell tooling. Returns "SPEC"/"MISSING"/"RANGE" sentinels on
// bad input so callers can distinguish drift causes.
export function computeAnchorHash(repoRoot: string, spec: string): string {
  const match = ANCHOR_SPEC_RE.exec(spec);
  if (!match) return "SPEC";
  const start = Number(match[2]);
  const end = Number(match[3]);
  const full = join(repoRoot, match[1]);
  if (!existsSync(full)) return "MISSING";
  const lines = splitContentLines(readFileSync(full, "utf8"));
  if (start < 1 || end > lines.length || start > end) return "RANGE";
  const text = lines
    .slice(start - 1, end)
    .map((line) => line.trimEnd())
    .join("\n");
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 8);
}
