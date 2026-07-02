import { existsSync } from "node:fs";
import { join } from "node:path";

import type { PluginInput } from "@opencode-ai/plugin";

import type { SecondBrainConfig } from "../../config/schema/second-brain";
import type { ContextCollector } from "../../features/context-injector";
import { isSyntheticOrInternalOnlyTextParts, log } from "../../shared";
import { isSystemDirective, removeSystemReminders } from "../../shared/system-directive";
import { selectWikiContext } from "../../tools/second-brain";
import { extractPromptText, looksLikeSlashCommand } from "../keyword-detector/detector";
import { secondBrainPinStore, type SecondBrainPinStore } from "./pin-store";

const APPROX_CHARS_PER_TOKEN = 4;
const DEFAULT_MAX_TOKENS = 1500;

const KNOWLEDGE_QUERY_LEAD_PATTERN = /^(what|how|why|where|which|who|when|does|do|is|are|can|should|explain|describe|tell me)\b/i;

const QUERY_STOPWORDS = new Set([
  "what",
  "how",
  "why",
  "where",
  "which",
  "who",
  "when",
  "does",
  "do",
  "did",
  "is",
  "are",
  "was",
  "were",
  "can",
  "could",
  "should",
  "would",
  "will",
  "the",
  "a",
  "an",
  "of",
  "to",
  "in",
  "on",
  "for",
  "with",
  "and",
  "or",
  "me",
  "my",
  "our",
  "you",
  "your",
  "it",
  "its",
  "that",
  "this",
  "explain",
  "describe",
  "tell",
  "about",
  "work",
  "works",
  "working",
  "use",
  "used",
  "using",
  "get",
  "got",
  "there",
  "here",
  "please",
]);

/**
 * Cheap intent gate: only inject wiki context when the message reads like a
 * knowledge question, keeping the token budget off ordinary work prompts.
 */
export function looksLikeKnowledgeQuery(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.includes("?")) return true;
  return KNOWLEDGE_QUERY_LEAD_PATTERN.test(trimmed);
}

/**
 * Reduce a natural-language question to content keywords. `searchWiki` uses
 * strict AND matching, so question words and filler must be stripped first.
 */
export function extractQueryKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !QUERY_STOPWORDS.has(word));
}

type ChatMessageInput = { sessionID: string };
type ChatMessageOutput = {
  parts: Array<{ type: string; text?: string; [key: string]: unknown }>;
};

/**
 * Registers the most relevant Second_Brain wiki page as low-priority context
 * on knowledge-style questions. Consumed by the existing context-injector
 * messages-transform path, so no new injection mechanism is introduced.
 */
export function createSecondBrainInjectorHook(
  ctx: Pick<PluginInput, "directory">,
  config: SecondBrainConfig,
  collector: Pick<ContextCollector, "register">,
  pinStore: Pick<SecondBrainPinStore, "record"> = secondBrainPinStore,
) {
  const root = config.path ?? join(ctx.directory, "Second_Brain");
  const maxChars = (config.max_inject_tokens ?? DEFAULT_MAX_TOKENS) * APPROX_CHARS_PER_TOKEN;

  return {
    "chat.message": async (input: ChatMessageInput, output: ChatMessageOutput): Promise<void> => {
      if (isSyntheticOrInternalOnlyTextParts(output.parts)) return;

      const promptText = extractPromptText(output.parts);
      if (isSystemDirective(promptText)) return;
      if (looksLikeSlashCommand(promptText)) return;

      const cleanText = removeSystemReminders(promptText);
      if (!looksLikeKnowledgeQuery(cleanText)) return;
      if (!existsSync(root)) return;

      const keywords = extractQueryKeywords(cleanText);
      if (keywords.length === 0) return;

      const selection = selectWikiContext(root, keywords.join(" "), { maxChars });
      if (!selection) return;

      collector.register(input.sessionID, {
        id: selection.target,
        source: "second-brain",
        content: `# Project memory: ${selection.target}\n\nAuto-recalled from the project's Second_Brain wiki (may be stale; verify against code).\n\n${selection.content}`,
        priority: "low",
      });
      pinStore.record(input.sessionID, selection.target);
      log("[second-brain-injector] Registered wiki context", {
        sessionID: input.sessionID,
        target: selection.target,
      });
    },
  };
}
