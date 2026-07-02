import type { CrawlResult } from "./types";
import { MAX_RESULT_CONTENT_CHARS } from "./constants";

// Single canonical formatter for local web-search results. Both the direct
// `web_search` tool and the `websearch-local-redirect` hook render through this
// so the response the LLM sees has one consistent shape regardless of entry point.
export function formatWebSearchResult(result: CrawlResult): string {
  const { query, goal, results, synthesis, pagesVisited } = result;

  const header = [
    `## Web Search Results`,
    `**Query:** ${query}`,
    `**Goal:** ${goal}`,
    `**Pages visited:** ${pagesVisited}`,
    `**Results found:** ${results.length}`,
  ];

  if (results.length === 0) {
    return [...header, "", `No relevant results found.`].join("\n");
  }

  const sections = results.map((entry, index) => {
    const content = entry.content.length > MAX_RESULT_CONTENT_CHARS ? `${entry.content.slice(0, MAX_RESULT_CONTENT_CHARS)}...` : entry.content;
    return [`### [${index + 1}] ${entry.title}`, `**URL:** ${entry.url}`, `**Relevance:** ${entry.relevanceReason}`, "", content].join("\n");
  });

  return [...header, "", ...sections, "", "---", `**Synthesis:** ${synthesis}`].join("\n");
}
