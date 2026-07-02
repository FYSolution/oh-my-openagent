import { describe, expect, it, afterEach } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebCache, createWebCache, WEB_CACHE_DIRNAME } from "./web-cache";
import type { CrawlResult } from "./types";

function makeResult(query: string): CrawlResult {
  return {
    query,
    goal: query,
    results: [{ url: "https://example.com", title: "Example", content: "hello", relevanceReason: "match" }],
    synthesis: "synthesized",
    pagesVisited: 1,
    source: "local-playwright",
  };
}

const tmpDirs: string[] = [];
function freshDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "omo-web-cache-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("WebCache", () => {
  it("#given a stored result #when read within ttl #then returns it", () => {
    // given
    const cache = new WebCache(freshDir(), { ttlMs: 60_000, now: () => 1_000 });
    const key = cache.computeKey({ query: "bun test", goal: "how", maxPages: 10, maxDepth: 3 });
    cache.set(key, "bun test", "how", makeResult("bun test"));

    // when
    const hit = cache.get(key);

    // then
    expect(hit?.query).toBe("bun test");
    expect(hit?.results[0]?.url).toBe("https://example.com");
  });

  it("#given a stored result #when ttl has elapsed #then returns null and evicts", () => {
    // given
    let clock = 1_000;
    const dir = freshDir();
    const cache = new WebCache(dir, { ttlMs: 5_000, now: () => clock });
    const key = cache.computeKey({ query: "q", goal: "g", maxPages: 10, maxDepth: 3 });
    cache.set(key, "q", "g", makeResult("q"));

    // when
    clock = 1_000 + 5_001;
    const hit = cache.get(key);

    // then
    expect(hit).toBeNull();
    expect(existsSync(join(dir, `${key}.json`))).toBe(false);
  });

  it("#given the same inputs #when computeKey is called #then the key is stable and case-insensitive", () => {
    // given
    const cache = new WebCache(freshDir(), { ttlMs: 60_000 });

    // when
    const a = cache.computeKey({ query: "Bun Test", goal: "How", maxPages: 10, maxDepth: 3 });
    const b = cache.computeKey({ query: "  bun test  ", goal: "how", maxPages: 10, maxDepth: 3 });
    const different = cache.computeKey({ query: "bun test", goal: "how", maxPages: 5, maxDepth: 3 });

    // then
    expect(a).toBe(b);
    expect(a).not.toBe(different);
  });

  it("#given a missing key #when get is called #then returns null", () => {
    // given
    const cache = new WebCache(freshDir(), { ttlMs: 60_000 });

    // when
    const hit = cache.get("does-not-exist");

    // then
    expect(hit).toBeNull();
  });

  it("#given createWebCache #when set #then writes under .omo/web-cache and carries trust source", () => {
    // given
    const root = freshDir();
    const cache = createWebCache(root, 60, () => 42);
    const key = cache.computeKey({ query: "q", goal: "g", maxPages: 10, maxDepth: 3 });

    // when
    cache.set(key, "q", "g", makeResult("q"));

    // then
    const file = join(root, ".omo", WEB_CACHE_DIRNAME, `${key}.json`);
    expect(existsSync(file)).toBe(true);
  });
});
