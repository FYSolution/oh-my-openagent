import type { CrawlConfig, CrawlState } from "./types";
import { CONSECUTIVE_SKIP_LIMIT } from "./constants";

export function isBudgetExhausted(state: CrawlState, config: CrawlConfig): boolean {
  if (state.pagesUsed >= config.maxPages) return true;
  if (Date.now() - state.startTime >= config.timeoutMs) return true;
  if (state.consecutiveSkips >= CONSECUTIVE_SKIP_LIMIT) return true;
  return false;
}

export function isDomainCapped(state: CrawlState, url: string, config: CrawlConfig): boolean {
  const domain = getDomain(url);
  const count = state.domainCounts.get(domain) || 0;
  return count >= config.domainPageCap;
}

export function isBlocked(url: string, config: CrawlConfig): boolean {
  const domain = getDomain(url);
  return config.blockedDomains.some((blocked) => domain === blocked || domain.endsWith(`.${blocked}`));
}

export function isDepthExceeded(depth: number, config: CrawlConfig): boolean {
  return depth > config.maxDepth;
}

export function recordPageVisit(state: CrawlState, url: string): void {
  state.visited.add(normalizeUrl(url));
  state.pagesUsed += 1;

  const domain = getDomain(url);
  state.domainCounts.set(domain, (state.domainCounts.get(domain) || 0) + 1);
}

export function isVisited(state: CrawlState, url: string): boolean {
  return state.visited.has(normalizeUrl(url));
}

interface UrlInstance {
  hostname: string;
  origin: string;
  pathname: string;
  hash: string;
  search: string;
  searchParams: { get(n: string): string | null; set(n: string, v: string): void; entries(): IterableIterator<[string, string]> };
  toString(): string;
}

type UrlConstructorType = new (url: string, base?: string) => UrlInstance;

const UrlConstructor = globalThis["URL" as keyof typeof globalThis] as unknown as UrlConstructorType;

export function normalizeUrl(rawUrl: string): string {
  try {
    const parsed = new UrlConstructor(rawUrl);
    // Strip fragments
    parsed.hash = "";
    // Sort query params for dedup
    const params = [...parsed.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
    parsed.search = "";
    params.forEach(([key, value]) => parsed.searchParams.set(key, value));
    // Remove trailing slash
    let pathname = parsed.pathname;
    if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }
    return `${parsed.origin}${pathname}${parsed.search}`;
  } catch {
    return rawUrl;
  }
}

function getDomain(rawUrl: string): string {
  try {
    return new UrlConstructor(rawUrl).hostname;
  } catch {
    return rawUrl;
  }
}
