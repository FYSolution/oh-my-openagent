import type { PluginInput } from "@opencode-ai/plugin";
import type { OhMyOpenCodeConfig } from "../../config";
import { executeCrawlLoop } from "../../tools/web-search-local/crawl-loop";
import { formatWebSearchResult } from "../../tools/web-search-local/format-results";
import { log } from "../../shared/logger";

const WEBSEARCH_MCP_TOOLS = new Set(["web_search_exa", "web_search", "tavily_search"]);

function isWebsearchMcpTool(toolName: string): boolean {
  return WEBSEARCH_MCP_TOOLS.has(toolName.toLowerCase());
}

export function createWebsearchLocalRedirectHook(_ctx: PluginInput, pluginConfig: OhMyOpenCodeConfig) {
  const preferLocal = pluginConfig.websearch?.prefer_local === true;

  return {
    "tool.execute.before": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { args: Record<string, unknown> },
    ): Promise<void> => {
      if (!preferLocal) return;
      if (!isWebsearchMcpTool(input.tool)) return;

      const query = (output.args.query as string) || (output.args.search as string) || "";
      if (!query) return;

      log("[websearch-local-redirect] Intercepting MCP websearch, routing to local", {
        tool: input.tool,
        query,
      });

      // Use heuristic-only mode (no LLM evaluation during crawl)
      const llmCall = async (_prompt: string): Promise<string> => {
        throw new Error("heuristic fallback");
      };

      const localConfig = pluginConfig.websearch?.local;
      const result = await executeCrawlLoop({
        query,
        goal: query,
        config: {
          maxPages: localConfig?.max_pages ?? 5,
          maxDepth: localConfig?.max_depth ?? 2,
          timeoutMs: localConfig?.timeout_ms ?? 60000,
          domainPageCap: localConfig?.domain_page_cap ?? 3,
          cooldownMs: localConfig?.cooldown_ms ?? 1000,
          headless: localConfig?.headless !== false,
        },
        llmCall,
      });

      // Deliver the normalized result (incl. the empty case). OpenCode surfaces a thrown
      // message as the tool output to the LLM.
      throw new Error(formatWebSearchResult(result));
    },
  };
}
