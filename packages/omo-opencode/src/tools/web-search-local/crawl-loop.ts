import type { CrawlConfig, CrawlResult, CrawlState, LLMDecision, PageResult, QueueEntry } from "./types";
import { DEFAULT_CRAWL_CONFIG, GOAL_COMPLETION_STOP_THRESHOLD } from "./constants";
import { createInitialState, enqueueUrls, dequeue, addCollected, recordSkip } from "./crawl-state";
import { isBudgetExhausted, isDomainCapped, isBlocked, isDepthExceeded, recordPageVisit, isVisited } from "./budget-guard";
import { searchDuckDuckGo } from "./search-engine";
import { scrapePage } from "./page-scraper";
import { evaluatePage } from "./llm-evaluator";
import { synthesizeResults } from "./result-synthesizer";
import { log } from "../../shared/logger";

type LLMCallFn = (prompt: string) => Promise<string>;

export interface CrawlLoopOptions {
  query: string;
  goal: string;
  config?: Partial<CrawlConfig>;
  llmCall: LLMCallFn;
}

function mergeConfig(partial?: Partial<CrawlConfig>): CrawlConfig {
  if (!partial) return { ...DEFAULT_CRAWL_CONFIG };
  return { ...DEFAULT_CRAWL_CONFIG, ...partial };
}

function shouldSkipTarget(state: CrawlState, target: QueueEntry, config: CrawlConfig): boolean {
  return (
    isVisited(state, target.url) ||
    isBlocked(target.url, config) ||
    isDomainCapped(state, target.url, config) ||
    isDepthExceeded(target.depth, config)
  );
}

function enqueueFollowLinks(state: CrawlState, decision: LLMDecision, depth: number): void {
  const entries: QueueEntry[] = decision.followLinks.map((link) => ({
    url: link.url,
    depth: depth + 1,
    reason: link.reason,
  }));
  enqueueUrls(state, entries);
}

function handleCollect(state: CrawlState, pageResult: PageResult, decision: LLMDecision, depth: number): void {
  if (decision.relevantExcerpt) {
    addCollected(state, {
      url: pageResult.url,
      title: pageResult.title,
      excerpt: decision.relevantExcerpt,
      depth,
    });
  }
}

type DecisionOutcome = { type: "stop"; result: CrawlResult } | { type: "continue" };

function executeDecision(
  decision: LLMDecision,
  state: CrawlState,
  pageResult: PageResult,
  depth: number,
  query: string,
  goal: string,
): DecisionOutcome {
  switch (decision.action) {
    case "COLLECT_AND_STOP": {
      handleCollect(state, pageResult, decision, depth);
      log("[web-search-local] COLLECT_AND_STOP", { url: pageResult.url, goalCompletion: decision.goalCompletion });
      return { type: "stop", result: synthesizeResults(query, goal, state.collected, state.pagesUsed) };
    }
    case "COLLECT_AND_CONTINUE": {
      handleCollect(state, pageResult, decision, depth);
      enqueueFollowLinks(state, decision, depth);
      if (pageResult.paginationNext && !decision.followLinks.some((l) => l.url === pageResult.paginationNext)) {
        enqueueUrls(state, [{ url: pageResult.paginationNext, depth, reason: "pagination continuation" }]);
      }
      if (decision.goalCompletion >= GOAL_COMPLETION_STOP_THRESHOLD) {
        log("[web-search-local] Goal completion threshold reached", { goalCompletion: decision.goalCompletion });
        return { type: "stop", result: synthesizeResults(query, goal, state.collected, state.pagesUsed) };
      }
      return { type: "continue" };
    }
    case "SKIP_AND_CONTINUE": {
      recordSkip(state);
      enqueueFollowLinks(state, decision, depth);
      return { type: "continue" };
    }
    case "STOP": {
      log("[web-search-local] LLM decided to STOP", { reasoning: decision.reasoning });
      return { type: "stop", result: synthesizeResults(query, goal, state.collected, state.pagesUsed) };
    }
    default:
      return { type: "continue" };
  }
}

async function initializeSearchQueue(state: CrawlState, query: string, config: CrawlConfig): Promise<boolean> {
  const searchResults = await searchDuckDuckGo(query, config.maxPages, config.headless);
  if (searchResults.length === 0) return false;

  enqueueUrls(
    state,
    searchResults.map((r) => ({ url: r.url, title: r.title, snippet: r.snippet, depth: 0, reason: "initial search result" })),
  );
  return true;
}

async function handleRefineSearch(state: CrawlState, newQuery: string, config: CrawlConfig): Promise<void> {
  log("[web-search-local] Refining search", { newQuery });
  const newResults = await searchDuckDuckGo(newQuery, 5, config.headless);
  enqueueUrls(
    state,
    newResults.map((r) => ({ url: r.url, title: r.title, snippet: r.snippet, depth: 0, reason: `refined search: ${newQuery}` })),
  );
}

async function fetchAndValidatePage(state: CrawlState, url: string, config: CrawlConfig): Promise<PageResult | null> {
  const pageResult = await scrapePage(url, config.headless);
  recordPageVisit(state, url);
  if (!pageResult.success) {
    recordSkip(state);
    return null;
  }
  return pageResult;
}

type LoopSignal = { action: "continue" } | { action: "break" } | { action: "return"; result: CrawlResult };

async function processNextTarget(state: CrawlState, config: CrawlConfig, query: string, goal: string, llmCall: LLMCallFn): Promise<LoopSignal> {
  if (isBudgetExhausted(state, config)) return { action: "break" };

  const target = dequeue(state);
  if (!target) return { action: "break" };
  if (shouldSkipTarget(state, target, config)) return { action: "continue" };
  if (state.pagesUsed > 0) await sleep(config.cooldownMs);

  const pageResult = await fetchAndValidatePage(state, target.url, config);
  if (!pageResult) return { action: "continue" };

  const decision = await evaluatePage({
    llmCall,
    query,
    goal,
    pageResult,
    state,
    budgetRemaining: config.maxPages - state.pagesUsed,
    currentDepth: target.depth,
    maxDepth: config.maxDepth,
  });

  if (decision.action === "REFINE_SEARCH" && decision.newQuery) {
    await handleRefineSearch(state, decision.newQuery, config);
    return { action: "continue" };
  }

  const outcome = executeDecision(decision, state, pageResult, target.depth, query, goal);
  if (outcome.type === "stop") return { action: "return", result: outcome.result };

  return { action: "continue" };
}

export async function executeCrawlLoop(options: CrawlLoopOptions): Promise<CrawlResult> {
  const { query, goal, llmCall } = options;
  const config = mergeConfig(options.config);
  const state: CrawlState = createInitialState();

  log("[web-search-local] Starting crawl loop", { query, goal, config });

  const hasResults = await initializeSearchQueue(state, query, config);
  if (!hasResults) {
    log("[web-search-local] No search results found");
    return synthesizeResults(query, goal, [], 0);
  }

  while (state.queue.length > 0) {
    const signal = await processNextTarget(state, config, query, goal, llmCall);
    if (signal.action === "break") break;
    if (signal.action === "return") return signal.result;
  }

  log("[web-search-local] Crawl loop completed", {
    pagesVisited: state.pagesUsed,
    pagesCollected: state.collected.length,
  });

  return synthesizeResults(query, goal, state.collected, state.pagesUsed);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
