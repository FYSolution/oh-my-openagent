export interface CrawlConfig {
  maxPages: number;
  maxDepth: number;
  timeoutMs: number;
  domainPageCap: number;
  cooldownMs: number;
  headless: boolean;
  blockedDomains: string[];
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface PageLink {
  text: string;
  url: string;
  location: "main" | "nav" | "footer" | "sidebar";
}

export interface PageResult {
  url: string;
  title: string;
  content: string;
  wordCount: number;
  links: PageLink[];
  paginationNext: string | null;
  success: boolean;
  error?: string;
}

export interface CollectedPage {
  url: string;
  title: string;
  excerpt: string;
  depth: number;
}

export interface QueueEntry {
  url: string;
  title?: string;
  snippet?: string;
  depth: number;
  reason?: string;
}

export type LLMAction = "COLLECT_AND_STOP" | "COLLECT_AND_CONTINUE" | "SKIP_AND_CONTINUE" | "REFINE_SEARCH" | "STOP";

export interface LLMDecision {
  action: LLMAction;
  reasoning: string;
  relevantExcerpt: string | null;
  followLinks: Array<{ url: string; reason: string }>;
  newQuery: string | null;
  goalCompletion: number;
}

export interface CrawlState {
  visited: Set<string>;
  collected: CollectedPage[];
  queue: QueueEntry[];
  pagesUsed: number;
  domainCounts: Map<string, number>;
  consecutiveSkips: number;
  startTime: number;
}

export interface CrawlResult {
  query: string;
  goal: string;
  results: Array<{
    url: string;
    title: string;
    content: string;
    relevanceReason: string;
  }>;
  synthesis: string;
  pagesVisited: number;
  source: "local-playwright";
}

export interface LocalWebSearchArgs {
  query: string;
  goal?: string;
  max_pages?: number;
  max_depth?: number;
  timeout_ms?: number;
}
