import { describe, expect, it } from "bun:test";
import { formatWebSearchResult } from "./format-results";
import { MAX_RESULT_CONTENT_CHARS } from "./constants";
import type { CrawlResult } from "./types";

function makeResult(overrides: Partial<CrawlResult> = {}): CrawlResult {
  return {
    query: "python 3.13 release date",
    goal: "find the python 3.13 release date",
    results: [
      { url: "https://example.com/a", title: "Page A", content: "Python 3.13 was released on 2024-10-07.", relevanceReason: "Collected at depth 0" },
      { url: "https://example.com/b", title: "Page B", content: "More detail here.", relevanceReason: "Collected at depth 1" },
    ],
    synthesis: "Python 3.13 released 2024-10-07.",
    pagesVisited: 2,
    source: "local-playwright",
    ...overrides,
  };
}

describe("formatWebSearchResult", () => {
  describe("#given a result with entries", () => {
    it("#when formatting #then emits the canonical header, per-result blocks, and synthesis", () => {
      // given
      const result = makeResult();
      // when
      const output = formatWebSearchResult(result);
      // then
      expect(output).toContain("## Web Search Results");
      expect(output).toContain("**Query:** python 3.13 release date");
      expect(output).toContain("**Goal:** find the python 3.13 release date");
      expect(output).toContain("**Pages visited:** 2");
      expect(output).toContain("**Results found:** 2");
      expect(output).toContain("### [1] Page A");
      expect(output).toContain("**URL:** https://example.com/a");
      expect(output).toContain("**Relevance:** Collected at depth 0");
      expect(output).toContain("### [2] Page B");
      expect(output).toContain("**Synthesis:** Python 3.13 released 2024-10-07.");
    });
  });

  describe("#given a result with no entries", () => {
    it("#when formatting #then emits the header and a no-results line, no synthesis", () => {
      // given
      const result = makeResult({ results: [], synthesis: "No relevant information found." });
      // when
      const output = formatWebSearchResult(result);
      // then
      expect(output).toContain("**Results found:** 0");
      expect(output).toContain("No relevant results found.");
      expect(output).not.toContain("### [1]");
      expect(output).not.toContain("**Synthesis:**");
    });
  });

  describe("#given a result whose content exceeds the cap", () => {
    it("#when formatting #then truncates content to MAX_RESULT_CONTENT_CHARS with an ellipsis", () => {
      // given
      const longContent = "x".repeat(MAX_RESULT_CONTENT_CHARS + 500);
      const result = makeResult({
        results: [{ url: "https://example.com/a", title: "Page A", content: longContent, relevanceReason: "Collected at depth 0" }],
      });
      // when
      const output = formatWebSearchResult(result);
      // then
      expect(output).toContain(`${"x".repeat(MAX_RESULT_CONTENT_CHARS)}...`);
      expect(output).not.toContain("x".repeat(MAX_RESULT_CONTENT_CHARS + 1));
    });
  });
});
