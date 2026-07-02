import type { CrawlConfig } from "./types";

export const DEFAULT_CRAWL_CONFIG: CrawlConfig = {
  maxPages: 10,
  maxDepth: 3,
  timeoutMs: 90_000,
  domainPageCap: 5,
  cooldownMs: 1_000,
  headless: true,
  blockedDomains: ["pinterest.com", "pinterest.co.uk", "quora.com", "facebook.com", "instagram.com", "tiktok.com", "twitter.com", "x.com"],
};

export const DUCKDUCKGO_URL = "https://duckduckgo.com/";
export const DUCKDUCKGO_LITE_URL = "https://html.duckduckgo.com/html/";

export const PAGE_LOAD_TIMEOUT_MS = 15_000;
export const SCROLL_WAIT_MS = 2_000;
export const MAX_SCROLL_ATTEMPTS = 3;
export const MAX_PAGINATION_FOLLOWS = 3;
export const MAX_CONTENT_WORDS = 3_000;
export const MAX_AUTO_FOLLOW_PER_PAGE = 3;
export const CONSECUTIVE_SKIP_LIMIT = 3;
export const GOAL_COMPLETION_STOP_THRESHOLD = 0.8;

export const LLM_EVAL_MAX_CONTENT_CHARS = 2_000;
export const LLM_EVAL_MAX_COLLECTED_SUMMARY_CHARS = 1_000;

export const MAX_RESULT_CONTENT_CHARS = 2_000;

export const BLOCKED_RESOURCE_TYPES = ["image", "media", "font", "stylesheet"] as const;

export const NAV_SELECTORS = ["nav", "header", "footer", "aside", "[role='navigation']", "[role='banner']", "[role='contentinfo']"];

export const CONTENT_SELECTORS = ["article", "main", "[role='main']", ".content", ".post-content", ".article-body", "#content"];

export const NOISE_CLASS_PATTERNS = [
  /\bads?\b/i,
  /\bsidebar\b/i,
  /\bnav\b/i,
  /\bfooter\b/i,
  /\bcookie\b/i,
  /\bpopup\b/i,
  /\bmodal\b/i,
  /\bbanner\b/i,
  /\bsocial\b/i,
  /\bshare\b/i,
  /\bcomment\b/i,
  /\brelated\b/i,
  /\brecommend\b/i,
];

export const PAGINATION_SELECTORS = [
  "nav[aria-label*='pagination' i]",
  "[class*='pagination' i]",
  "[class*='pager' i]",
  "[class*='page-nav' i]",
  "[id*='pagination' i]",
];

export const PAGINATION_NEXT_PATTERNS = [/\bnext\b/i, /\b›\b/, /\b»\b/, /→/, /\bolder\b/i];

export const PAGINATION_REGION_MAX_CHARS = 4_000;

export const SEARCH_RESULT_SELECTORS = ["[data-testid='result']", ".result", ".results_links", "#links .result", ".web-result"];

export const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
];
