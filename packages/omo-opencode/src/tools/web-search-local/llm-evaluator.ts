import type { CrawlState, PageResult, LLMDecision, LLMAction } from "./types";
import {
  LLM_EVAL_MAX_CONTENT_CHARS,
  LLM_EVAL_MAX_COLLECTED_SUMMARY_CHARS,
  MAX_AUTO_FOLLOW_PER_PAGE,
  GOAL_COMPLETION_STOP_THRESHOLD,
} from "./constants";
import { getCollectedSummary } from "./crawl-state";
import { log } from "../../shared/logger";

type LLMCallFn = (prompt: string) => Promise<string>;

function buildEvaluationPrompt(
  query: string,
  goal: string,
  pageResult: PageResult,
  state: CrawlState,
  budgetRemaining: number,
  currentDepth: number,
  maxDepth: number,
): string {
  const contentPreview = pageResult.content.slice(0, LLM_EVAL_MAX_CONTENT_CHARS);
  const collectedSummary = getCollectedSummary(state, LLM_EVAL_MAX_COLLECTED_SUMMARY_CHARS);

  const mainLinks = pageResult.links
    .filter((l) => l.location === "main")
    .slice(0, 15)
    .map((l, i) => `  ${i + 1}. [${l.text}] ${l.url}`)
    .join("\n");

  return `You are a web research assistant evaluating a scraped page.

RESEARCH GOAL: "${goal}"
ORIGINAL QUERY: "${query}"

PAGE JUST SCRAPED:
  URL: ${pageResult.url}
  Title: ${pageResult.title}
  Content (first ${LLM_EVAL_MAX_CONTENT_CHARS} chars):
${contentPreview}

  Links found in main content:
${mainLinks || "  (none)"}

${pageResult.paginationNext ? `  Pagination next: ${pageResult.paginationNext}` : ""}

ALREADY COLLECTED (${state.collected.length} pages):
${collectedSummary || "  (nothing yet)"}

BUDGET REMAINING: ${budgetRemaining} pages, depth ${currentDepth}/${maxDepth}

INSTRUCTIONS:
1. Does this page contain information relevant to the GOAL?
2. Is the GOAL already sufficiently answered by what's been collected so far plus this page?
3. Which links (if any) would provide missing information?

Respond in EXACTLY this JSON format (no other text):
{
  "action": "COLLECT_AND_STOP" | "COLLECT_AND_CONTINUE" | "SKIP_AND_CONTINUE" | "REFINE_SEARCH" | "STOP",
  "reasoning": "brief explanation of decision",
  "relevant_excerpt": "extracted text that answers part of the goal (null if SKIP or STOP)",
  "follow_links": [
    { "url": "full url", "reason": "why this link might have missing info" }
  ],
  "new_query": "refined search query (only if REFINE_SEARCH, else null)",
  "goal_completion": 0.0
}

DECISION RULES:
- If goal_completion >= ${GOAL_COMPLETION_STOP_THRESHOLD} → prefer STOP or COLLECT_AND_STOP
- If budget_remaining <= 2 → only follow HIGH-confidence links
- If current page has no relevant content AND no promising links → SKIP_AND_CONTINUE
- If all collected info is tangential → REFINE_SEARCH with better query
- NEVER follow more than ${MAX_AUTO_FOLLOW_PER_PAGE} links from a single page
- NEVER follow links to completely unrelated domains unless directly relevant to the goal
- If you've seen the same information repeated in collected pages → STOP
- Set goal_completion to a float between 0.0 and 1.0 representing how much of the goal is answered`;
}

function parseDecision(raw: string): LLMDecision | null {
  try {
    // Extract JSON from potential markdown code blocks
    let jsonStr = raw.trim();
    const jsonMatch = /```(?:json)?\s*([\s\S]*?)```/.exec(jsonStr);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }
    // Try to find JSON object in the response
    const objectMatch = /\{[\s\S]*\}/.exec(jsonStr);
    if (objectMatch) {
      jsonStr = objectMatch[0];
    }

    const parsed = JSON.parse(jsonStr);

    const validActions: LLMAction[] = ["COLLECT_AND_STOP", "COLLECT_AND_CONTINUE", "SKIP_AND_CONTINUE", "REFINE_SEARCH", "STOP"];

    if (!validActions.includes(parsed.action)) {
      return null;
    }

    return {
      action: parsed.action,
      reasoning: String(parsed.reasoning || ""),
      relevantExcerpt: parsed.relevant_excerpt ?? null,
      followLinks: Array.isArray(parsed.follow_links)
        ? parsed.follow_links
            .filter((l: unknown) => l && typeof l === "object" && "url" in (l as Record<string, unknown>))
            .slice(0, MAX_AUTO_FOLLOW_PER_PAGE)
            .map((l: { url: string; reason?: string }) => ({
              url: String(l.url),
              reason: String(l.reason || ""),
            }))
        : [],
      newQuery: parsed.new_query ?? null,
      goalCompletion: typeof parsed.goal_completion === "number" ? Math.max(0, Math.min(1, parsed.goal_completion)) : 0,
    };
  } catch (error) {
    log("[web-search-local] Failed to parse LLM decision", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export interface EvaluatePageParams {
  llmCall: LLMCallFn;
  query: string;
  goal: string;
  pageResult: PageResult;
  state: CrawlState;
  budgetRemaining: number;
  currentDepth: number;
  maxDepth: number;
}

export async function evaluatePage(params: EvaluatePageParams): Promise<LLMDecision> {
  const { llmCall, query, goal, pageResult, state, budgetRemaining, currentDepth, maxDepth } = params;
  const prompt = buildEvaluationPrompt(query, goal, pageResult, state, budgetRemaining, currentDepth, maxDepth);

  try {
    const response = await llmCall(prompt);
    const decision = parseDecision(response);

    if (decision) {
      log("[web-search-local] LLM decision", {
        url: pageResult.url,
        action: decision.action,
        goalCompletion: decision.goalCompletion,
        followLinksCount: decision.followLinks.length,
      });
      return decision;
    }
  } catch (error) {
    log("[web-search-local] LLM evaluation failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Fallback: if LLM fails, collect if page has content, otherwise skip
  return {
    action: pageResult.wordCount > 100 ? "COLLECT_AND_CONTINUE" : "SKIP_AND_CONTINUE",
    reasoning: "LLM evaluation failed; using heuristic fallback",
    relevantExcerpt: pageResult.wordCount > 100 ? pageResult.content.slice(0, 500) : null,
    followLinks: [],
    newQuery: null,
    goalCompletion: state.collected.length > 0 ? 0.5 : 0.1,
  };
}
