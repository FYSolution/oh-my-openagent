import { tool, type PluginInput, type ToolDefinition } from "@opencode-ai/plugin";
import type { LocalWebSearchArgs, CrawlConfig } from "./types";
import { executeCrawlLoop } from "./crawl-loop";
import { formatWebSearchResult } from "./format-results";
import { DEFAULT_CRAWL_CONFIG } from "./constants";
import { setFetchOnlyMode } from "./playwright-pool";
import type { WebCache } from "./web-cache";
import { log } from "../../shared/logger";

const TOOL_DESCRIPTION = `Search the web locally using Playwright browser automation. Scrapes DuckDuckGo search results and follows links intelligently with LLM-guided drill-down to find relevant information. Use this when you need to find information from the web without relying on external search APIs. Requires a clear goal describing what information you're looking for.`;

export type LocalWebSearchToolOptions = {
  config?: Partial<CrawlConfig>;
  browser?: "auto" | "fetch-only";
  llmCall: (prompt: string) => Promise<string>;
  cache?: WebCache;
};

export function createLocalWebSearchTool(ctx: PluginInput, options: LocalWebSearchToolOptions): ToolDefinition {
  // Apply fetch-only mode if configured
  if (options.browser === "fetch-only") {
    setFetchOnlyMode(true);
  }
  return tool({
    description: TOOL_DESCRIPTION,
    args: {
      query: tool.schema.string().describe("Search query to find information about"),
      goal: tool.schema
        .string()
        .optional()
        .describe("Specific goal describing what information to find. Without a clear goal, the search may not drill down effectively."),
      max_pages: tool.schema.number().optional().describe("Maximum number of pages to visit (default 10, max 15)"),
      max_depth: tool.schema.number().optional().describe("Maximum link-follow depth from search results (default 3, max 5)"),
      timeout_ms: tool.schema.number().optional().describe("Total timeout in milliseconds (default 90000)"),
    },
    async execute(args: LocalWebSearchArgs) {
      const query = args.query?.trim();
      if (!query) {
        return "Error: query is required";
      }

      const goal = args.goal?.trim() || query;
      const maxPages = Math.min(args.max_pages || DEFAULT_CRAWL_CONFIG.maxPages, 15);
      const maxDepth = Math.min(args.max_depth || DEFAULT_CRAWL_CONFIG.maxDepth, 5);
      const timeoutMs = args.timeout_ms || DEFAULT_CRAWL_CONFIG.timeoutMs;

      log("[web-search-local] Tool invoked", { query, goal, maxPages, maxDepth });

      const cacheKey = options.cache?.computeKey({ query, goal, maxPages, maxDepth });
      if (options.cache && cacheKey) {
        const cached = options.cache.get(cacheKey);
        if (cached) {
          log("[web-search-local] Cache hit", { query, goal });
          return formatWebSearchResult(cached);
        }
      }

      try {
        const result = await executeCrawlLoop({
          query,
          goal,
          config: {
            ...options.config,
            maxPages,
            maxDepth,
            timeoutMs,
          },
          llmCall: options.llmCall,
        });

        if (options.cache && cacheKey && result.results.length > 0) {
          options.cache.set(cacheKey, query, goal, result);
        }

        // Format output for the agent (single canonical shape, incl. the empty case)
        return formatWebSearchResult(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log("[web-search-local] Tool execution failed", { error: message });

        if (message.includes("playwright-core is not installed")) {
          return `Error: Local web search requires playwright-core. Install it with: bun add playwright-core\n\nAlternatively, configure the websearch MCP (Exa or Tavily) for API-based web search.`;
        }

        return `Error: Web search failed: ${message}`;
      }
    },
  });
}
