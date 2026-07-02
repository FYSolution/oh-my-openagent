import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { freshnessFactor, trustFactor } from "./constants";
import { fragmentsRootOf } from "./fragment-loader";
import { freshnessOf } from "./freshness";
import { parseFrontmatter } from "./frontmatter-parser";
import type { FreshnessStateName, SearchOptions, SearchResult } from "./types";

const TARGET_MATCH_WEIGHT = 6;
const TAG_MATCH_WEIGHT = 3;

function frontmatterText(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value.join(" ");
  return typeof value === "string" ? value : "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function walkMarkdown(dir: string, acc: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkMarkdown(full, acc);
    else if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md") acc.push(full);
  }
}

function extractTags(content: string): string {
  const lines = content.split(/\r?\n/).slice(0, 15);
  let inFrontmatter = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "---") {
      if (!inFrontmatter) {
        inFrontmatter = true;
        continue;
      }
      break;
    }
    if (inFrontmatter) {
      const match = /^tags:\s*\[(.+)\]/.exec(trimmed);
      if (match) return match[1];
    }
  }
  return "";
}

function bestMatchLine(content: string, keywords: string[]): { line: string; lineNum: number; score: number } {
  const lines = content.split(/\r?\n/);
  let bestScore = 0;
  let bestLine = "";
  let bestLineNum = 0;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed === "---" || trimmed === "") continue;
    let score = 0;
    for (const keyword of keywords) {
      if (new RegExp(escapeRegExp(keyword), "i").test(raw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestLine = trimmed;
      bestLineNum = i + 1;
    }
  }
  const line = bestLine.length > 80 ? `${bestLine.slice(0, 77)}...` : bestLine;
  return { line, lineNum: bestLineNum, score: bestScore };
}

type FileMatch = {
  path: string;
  hitCount: number;
  matchedCount: number;
  tagTargetBonus: number;
  line: string;
  lineNum: number;
  lineScore: number;
  tags: string;
  state: FreshnessStateName;
  trust: string;
};

function evaluateFile(filePath: string, keywords: string[], wikiRoot: string, repoRoot: string, now: Date): FileMatch | null {
  const content = readFileSync(filePath, "utf8");
  if (!content) return null;

  const { frontmatter } = parseFrontmatter(content);
  const targetText = frontmatterText(frontmatter.target);
  const tagsText = frontmatterText(frontmatter.tags);

  let hitCount = 0;
  let matchedCount = 0;
  let tagTargetBonus = 0;
  for (const keyword of keywords) {
    const escaped = escapeRegExp(keyword);
    const bodyMatches = content.match(new RegExp(escaped, "gi"));
    const inTarget = new RegExp(escaped, "i").test(targetText);
    const inTags = new RegExp(escaped, "i").test(tagsText);
    if (bodyMatches) hitCount += bodyMatches.length;
    if (inTarget) tagTargetBonus += TARGET_MATCH_WEIGHT;
    if (inTags) tagTargetBonus += TAG_MATCH_WEIGHT;
    if (bodyMatches || inTarget || inTags) matchedCount++;
  }
  if (matchedCount === 0) return null;

  const match = bestMatchLine(content, keywords);
  const freshness = freshnessOf(frontmatter, { repoRoot, now });
  return {
    path: relative(wikiRoot, filePath).split(sep).join("/"),
    hitCount,
    matchedCount,
    tagTargetBonus,
    line: match.line,
    lineNum: match.lineNum,
    lineScore: match.score,
    tags: extractTags(content),
    state: freshness.state,
    trust: freshness.trust,
  };
}

function scoreOf(fileMatch: FileMatch, keywordCount: number, orMode: boolean): number {
  const base = fileMatch.hitCount + fileMatch.lineScore * 5 + fileMatch.tagTargetBonus;
  const fraction = orMode ? fileMatch.matchedCount / keywordCount : 1;
  return Math.round(base * fraction * freshnessFactor(fileMatch.state) * trustFactor(fileMatch.trust) * 100) / 100;
}

// Keyword AND search ranked by relevance x freshness x trust, plus a bonus for
// keywords that hit a fragment's `target`/`tags`. Falls back to OR (any keyword,
// scaled by the fraction matched) only when AND matches nothing, so knowledge
// questions with partial vocabulary overlap still surface the closest pages.
export function searchWiki(secondBrainRoot: string, query: string, options: SearchOptions = {}): SearchResult[] {
  const top = options.top ?? 20;
  const now = options.now ?? new Date();
  const repoRoot = dirname(secondBrainRoot);
  const wikiRoot = join(secondBrainRoot, "wiki");
  // Fragments are the committed source of truth; .compiled/, log/, and journal/
  // are excluded so results are deterministic across machines and never
  // duplicate a fragment with its generated compiled copy.
  const fragmentsRoot = fragmentsRootOf(secondBrainRoot);
  const searchPath = options.folder ? join(fragmentsRoot, options.folder) : fragmentsRoot;
  if (!existsSync(searchPath)) return [];

  const keywords = query
    .trim()
    .split(/\s+/)
    .filter((keyword) => keyword !== "");
  if (keywords.length === 0) return [];

  const files: string[] = [];
  walkMarkdown(searchPath, files);

  const evaluated: FileMatch[] = [];
  for (const filePath of files) {
    const fileMatch = evaluateFile(filePath, keywords, wikiRoot, repoRoot, now);
    if (fileMatch) evaluated.push(fileMatch);
  }

  // AND first; OR fallback only when nothing matched every keyword.
  const andMatches = evaluated.filter((fileMatch) => fileMatch.matchedCount === keywords.length);
  const orMode = andMatches.length === 0;
  const chosen = orMode ? evaluated : andMatches;

  const results: SearchResult[] = chosen.map((fileMatch) => ({
    path: fileMatch.path,
    score: scoreOf(fileMatch, keywords.length, orMode),
    lineNum: fileMatch.lineNum,
    line: fileMatch.line,
    tags: fileMatch.tags,
    state: fileMatch.state,
  }));

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, top);
}
