import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseFrontmatter, readTarget, searchWiki, type SearchOptions } from "@oh-my-opencode/second-brain-core";

export type SelectWikiContextOptions = {
  now?: Date;
  maxChars?: number;
  minScore?: number;
  searchTop?: number;
};

export type WikiContextSelection = {
  target: string;
  content: string;
};

const DEFAULT_MAX_CHARS = 6000;
const DEFAULT_MIN_SCORE = 0;
const DEFAULT_SEARCH_TOP = 3;

/**
 * Pure selection of the single most relevant wiki page for a query.
 * Searches fragments, resolves the top hit's `target` page, reads and
 * truncates it. Returns null when nothing relevant resolves to a page.
 */
export function selectWikiContext(secondBrainRoot: string, query: string, options: SelectWikiContextOptions = {}): WikiContextSelection | null {
  const now = options.now;
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const minScore = options.minScore ?? DEFAULT_MIN_SCORE;
  const searchOptions: SearchOptions = {
    top: options.searchTop ?? DEFAULT_SEARCH_TOP,
    now,
  };

  const results = searchWiki(secondBrainRoot, query, searchOptions);
  const top = results.find((result) => result.score > minScore);
  if (!top) return null;

  const target = resolveTarget(secondBrainRoot, top.path);
  if (!target) return null;

  const page = readTarget(secondBrainRoot, target, { now });
  if (!page) return null;

  const content = page.length > maxChars ? `${page.slice(0, maxChars)}\n\n[...truncated]` : page;
  return { target, content };
}

function resolveTarget(secondBrainRoot: string, relativePath: string): string | null {
  const fragmentPath = join(secondBrainRoot, "wiki", relativePath);
  try {
    const { frontmatter } = parseFrontmatter(readFileSync(fragmentPath, "utf8"));
    return typeof frontmatter.target === "string" ? frontmatter.target : null;
  } catch {
    return null;
  }
}
