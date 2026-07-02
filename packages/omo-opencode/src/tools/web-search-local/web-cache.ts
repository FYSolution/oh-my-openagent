import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CrawlResult } from "./types";
import { log } from "../../shared/logger";

// R5 web-cache: a per-user, on-disk, TTL-bound memo of web_search results under
// `.omo/web-cache/`. Scraped web content is volatile and license-encumbered, so
// it is NEVER committed to the wiki — this cache only avoids repeating the same
// crawl within its TTL. Every entry carries `trust: "source"`.

export const WEB_CACHE_DIRNAME = "web-cache";
export const DEFAULT_WEB_CACHE_TTL_MINUTES = 60;

export interface WebCacheEntry {
  trust: "source";
  cachedAt: number;
  query: string;
  goal: string;
  result: CrawlResult;
}

export interface WebCacheOptions {
  ttlMs: number;
  now?: () => number;
}

export interface WebCacheKeyInput {
  query: string;
  goal: string;
  maxPages: number;
  maxDepth: number;
}

export class WebCache {
  private readonly dir: string;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(dir: string, options: WebCacheOptions) {
    this.dir = dir;
    this.ttlMs = options.ttlMs;
    this.now = options.now ?? (() => Date.now());
  }

  computeKey(input: WebCacheKeyInput): string {
    const normalized = JSON.stringify({
      query: input.query.trim().toLowerCase(),
      goal: input.goal.trim().toLowerCase(),
      maxPages: input.maxPages,
      maxDepth: input.maxDepth,
    });
    return createHash("sha256").update(normalized, "utf8").digest("hex").slice(0, 32);
  }

  get(key: string): CrawlResult | null {
    const file = this.fileFor(key);
    if (!existsSync(file)) return null;
    const entry = this.readEntry(file);
    if (!entry) return null;
    if (this.now() - entry.cachedAt > this.ttlMs) {
      this.evict(file);
      return null;
    }
    return entry.result;
  }

  set(key: string, query: string, goal: string, result: CrawlResult): void {
    const entry: WebCacheEntry = {
      trust: "source",
      cachedAt: this.now(),
      query,
      goal,
      result,
    };
    try {
      mkdirSync(this.dir, { recursive: true });
      const file = this.fileFor(key);
      const tmp = `${file}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(entry), "utf8");
      renameSync(tmp, file);
    } catch (error) {
      log("[web-cache] Failed to write cache entry", { key, error: String(error) });
    }
  }

  private fileFor(key: string): string {
    return join(this.dir, `${key}.json`);
  }

  private readEntry(file: string): WebCacheEntry | null {
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as WebCacheEntry;
      if (!parsed || typeof parsed.cachedAt !== "number" || !parsed.result) return null;
      return parsed;
    } catch (error) {
      log("[web-cache] Failed to read cache entry", { file, error: String(error) });
      return null;
    }
  }

  private evict(file: string): void {
    try {
      rmSync(file, { force: true });
    } catch (error) {
      log("[web-cache] Failed to evict expired entry", { file, error: String(error) });
    }
  }
}

export function createWebCache(directory: string, ttlMinutes: number, now?: () => number): WebCache {
  const dir = join(directory, ".omo", WEB_CACHE_DIRNAME);
  return new WebCache(dir, { ttlMs: ttlMinutes * 60_000, now });
}
