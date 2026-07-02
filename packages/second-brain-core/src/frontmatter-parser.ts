import { splitContentLines } from "./text-lines";
import type { Frontmatter, ParsedFragment } from "./types";

const KEY_START_RE = /^(\w[\w-]*):/;
const KEY_VALUE_RE = /^(\w[\w-]*):\s*(.+)$/;
const FLOW_ARRAY_RE = /^\[(.*)\]$/;
const QUOTED_RE = /^['"](.+)['"]$/;

// Port of Parse-FragmentFrontmatter. Continuation lines are merged so a formatter that
// reflows `code_anchors: [a, b]` across several lines collapses back onto its key before
// the value is parsed.
export function parseFrontmatter(text: string): ParsedFragment {
  const lines = splitContentLines(text);
  const frontmatter: Frontmatter = {};
  let inFrontmatter = false;
  let done = false;
  let bodyStart = 0;
  const fmLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!done && line === "---") {
      if (!inFrontmatter) {
        inFrontmatter = true;
        continue;
      }
      done = true;
      bodyStart = i + 1;
      continue;
    }
    if (inFrontmatter && !done && line !== "") fmLines.push(line);
  }

  const logical: string[] = [];
  for (const fmLine of fmLines) {
    if (KEY_START_RE.test(fmLine)) {
      logical.push(fmLine);
    } else if (logical.length > 0) {
      logical[logical.length - 1] = `${logical[logical.length - 1]} ${fmLine}`.trim();
    }
  }

  for (const logicalLine of logical) {
    const match = KEY_VALUE_RE.exec(logicalLine);
    if (!match) continue;
    const key = match[1];
    const raw = match[2].trim();
    const flow = FLOW_ARRAY_RE.exec(raw);
    if (flow) {
      frontmatter[key] = flow[1]
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item !== "");
      continue;
    }
    const quoted = QUOTED_RE.exec(raw);
    frontmatter[key] = quoted ? quoted[1] : raw;
  }

  const body = bodyStart < lines.length ? lines.slice(bodyStart).join("\n").trim() : "";
  return { frontmatter, body };
}
