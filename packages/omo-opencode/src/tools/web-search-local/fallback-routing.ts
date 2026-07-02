import type { OhMyOpenCodeConfig } from "../../config";
import { createWebsearchConfig } from "../../mcp/websearch";
import { log } from "../../shared/logger";

/**
 * Determines whether the local web search fallback should be activated.
 *
 * Returns true when:
 * - "websearch" is in disabled_mcps
 * - websearch provider is "tavily" but TAVILY_API_KEY is missing (createWebsearchConfig returns undefined)
 * - User explicitly set websearch.prefer_local = true
 */
export function isLocalWebSearchFallbackNeeded(config?: OhMyOpenCodeConfig): boolean {
  if (!config) return true;

  // Explicit opt-in to local search
  if (config.websearch?.prefer_local) {
    log("[web-search-local] prefer_local enabled, using local fallback");
    return true;
  }

  // Check if websearch is explicitly disabled
  if (config.disabled_mcps?.includes("websearch")) {
    log("[web-search-local] websearch MCP disabled, using local fallback");
    return true;
  }

  // Check if the MCP config would produce a valid server
  const websearchMcpConfig = createWebsearchConfig(config.websearch);
  if (!websearchMcpConfig) {
    log("[web-search-local] websearch MCP config returned undefined (missing API key?), using local fallback");
    return true;
  }

  return false;
}

/**
 * Checks whether the local web search feature is explicitly disabled.
 */
export function isLocalWebSearchDisabled(config?: OhMyOpenCodeConfig): boolean {
  if (!config) return false;
  return config.websearch?.local?.enabled === false;
}
