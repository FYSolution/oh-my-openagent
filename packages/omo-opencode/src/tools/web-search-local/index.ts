export { createLocalWebSearchTool, type LocalWebSearchToolOptions } from "./tool";
export { executeCrawlLoop, type CrawlLoopOptions } from "./crawl-loop";
export { formatWebSearchResult } from "./format-results";
export { isLocalWebSearchFallbackNeeded, isLocalWebSearchDisabled } from "./fallback-routing";
export { disposePool } from "./playwright-pool";
export {
  WebCache,
  createWebCache,
  WEB_CACHE_DIRNAME,
  DEFAULT_WEB_CACHE_TTL_MINUTES,
  type WebCacheEntry,
  type WebCacheOptions,
  type WebCacheKeyInput,
} from "./web-cache";
export type { CrawlConfig, CrawlResult, LocalWebSearchArgs, SearchResult, PageResult, LLMDecision } from "./types";
