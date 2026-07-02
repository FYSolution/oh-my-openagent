import { z } from "zod";

export const WebsearchProviderSchema = z.enum(["exa", "tavily"]);

export const WebCacheConfigSchema = z.object({
  /**
   * Memoize local web_search results on disk under `.omo/web-cache/` (per-user,
   * never committed). Off by default. Cached content carries trust "source".
   */
  enabled: z.boolean().optional(),
  /** Time-to-live for a cached search in minutes. Default 60. */
  ttl_minutes: z.number().min(1).optional(),
});

export const LocalWebSearchConfigSchema = z.object({
  /** Enable the local Playwright-based web search fallback. Default true. */
  enabled: z.boolean().optional(),
  /**
   * Browser mode for page scraping.
   * - "auto": Try Playwright first, fall back to fetch (default)
   * - "fetch-only": Skip Playwright entirely, use fetch for all scraping (fast on corporate networks)
   */
  browser: z.enum(["auto", "fetch-only"]).optional(),
  /** Maximum pages to visit per search (1-15). Default 10. */
  max_pages: z.number().min(1).max(15).optional(),
  /** Maximum link-follow depth from search results (1-5). Default 3. */
  max_depth: z.number().min(1).max(5).optional(),
  /** Total timeout per search in milliseconds. Default 90000. */
  timeout_ms: z.number().min(5000).optional(),
  /** Maximum pages per single domain. Default 5. */
  domain_page_cap: z.number().min(1).max(20).optional(),
  /** Minimum delay between page navigations in ms. Default 1000. */
  cooldown_ms: z.number().min(200).optional(),
  /** Run browser headless. Default true. Set false for debugging. */
  headless: z.boolean().optional(),
  /** Domains to never scrape. */
  blocked_domains: z.array(z.string()).optional(),
  /** On-disk memoization of web_search results (`.omo/web-cache/`, off by default). */
  cache: WebCacheConfigSchema.optional(),
});

export const WebsearchConfigSchema = z.object({
  /**
   * Websearch provider to use.
   * - "exa": Uses Exa websearch (default, works without API key)
   * - "tavily": Uses Tavily websearch (requires TAVILY_API_KEY)
   */
  provider: WebsearchProviderSchema.optional(),
  /**
   * Force local Playwright-based search even when MCP is available.
   * Useful to avoid API costs.
   */
  prefer_local: z.boolean().optional(),
  /** Configuration for the local Playwright-based web search fallback. */
  local: LocalWebSearchConfigSchema.optional(),
});

export type WebsearchProvider = z.infer<typeof WebsearchProviderSchema>;
export type WebsearchConfig = z.infer<typeof WebsearchConfigSchema>;
export type LocalWebSearchConfig = z.infer<typeof LocalWebSearchConfigSchema>;
export type WebCacheConfig = z.infer<typeof WebCacheConfigSchema>;
