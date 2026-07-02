import type { CrawlState, QueueEntry, CollectedPage } from "./types";

export function createInitialState(): CrawlState {
  return {
    visited: new Set(),
    collected: [],
    queue: [],
    pagesUsed: 0,
    domainCounts: new Map(),
    consecutiveSkips: 0,
    startTime: Date.now(),
  };
}

export function enqueueUrls(state: CrawlState, entries: QueueEntry[]): void {
  for (const entry of entries) {
    if (!state.visited.has(entry.url)) {
      // Avoid duplicate queue entries
      const alreadyQueued = state.queue.some((q) => q.url === entry.url);
      if (!alreadyQueued) {
        state.queue.push(entry);
      }
    }
  }
}

export function dequeue(state: CrawlState): QueueEntry | undefined {
  return state.queue.shift();
}

export function addCollected(state: CrawlState, page: CollectedPage): void {
  state.collected.push(page);
  state.consecutiveSkips = 0;
}

export function recordSkip(state: CrawlState): void {
  state.consecutiveSkips += 1;
}

export function getCollectedSummary(state: CrawlState, maxChars: number): string {
  const lines = state.collected.map((p) => `- ${p.url}: ${p.excerpt.slice(0, 100)}`);
  const full = lines.join("\n");
  return full.length > maxChars ? full.slice(0, maxChars) + "..." : full;
}
