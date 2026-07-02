import type { CollectedPage, CrawlResult } from "./types";

export function synthesizeResults(query: string, goal: string, collected: CollectedPage[], pagesVisited: number): CrawlResult {
  const results = collected.map((page) => ({
    url: page.url,
    title: page.title,
    content: page.excerpt,
    relevanceReason: `Collected at depth ${page.depth}`,
  }));

  const synthesis = buildSynthesis(goal, collected);

  return {
    query,
    goal,
    results,
    synthesis,
    pagesVisited,
    source: "local-playwright",
  };
}

function buildSynthesis(goal: string, collected: CollectedPage[]): string {
  if (collected.length === 0) {
    return `No relevant information found for: ${goal}`;
  }

  const parts = [
    `Found ${collected.length} relevant page(s) for: ${goal}`,
    "",
    ...collected.map((page, i) => `[${i + 1}] ${page.title} (${page.url})\n${page.excerpt.slice(0, 300)}${page.excerpt.length > 300 ? "..." : ""}`),
  ];

  return parts.join("\n");
}
