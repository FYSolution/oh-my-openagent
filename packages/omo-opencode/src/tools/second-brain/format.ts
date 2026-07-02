import type { SearchResult } from "@oh-my-opencode/second-brain-core";

function escapeCell(value: string): string {
  return value.replaceAll("|", String.raw`\|`);
}

export function formatSearchResults(query: string, results: SearchResult[]): string {
  if (results.length === 0) {
    return `No Second_Brain wiki fragments matched "${query}".`;
  }
  const rows = results.map((result) => `| ${result.score} | ${result.state} | wiki/${result.path} | ${escapeCell(result.line)} |`);
  return [
    `Found ${results.length} Second_Brain wiki fragment(s) for "${query}":`,
    "",
    "| Score | State | File | Match |",
    "| ----- | ----- | ---- | ----- |",
    ...rows,
  ].join("\n");
}
