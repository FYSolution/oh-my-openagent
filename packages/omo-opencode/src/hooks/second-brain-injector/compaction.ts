import { existsSync } from "node:fs";
import { join } from "node:path";

import type { PluginInput } from "@opencode-ai/plugin";

import { readTarget } from "@oh-my-opencode/second-brain-core";

import type { SecondBrainConfig } from "../../config/schema/second-brain";
import { secondBrainPinStore, type SecondBrainPinStore } from "./pin-store";

const APPROX_CHARS_PER_TOKEN = 4;
const DEFAULT_MAX_TOKENS = 1500;

type CompactionInjectorDeps = {
  pinStore?: Pick<SecondBrainPinStore, "list">;
  readTarget?: typeof readTarget;
};

/**
 * Re-emits the Second_Brain wiki pages pinned for a session so they survive
 * compaction. Pages are re-read at compaction time (current compiled text;
 * removed targets resolve to null and are dropped) under the same token cap.
 * Consumed via the existing `compactionContextInjector` slot in
 * `session-compacting.ts` — pushed into `output.context`.
 */
export function createSecondBrainCompactionInjector(
  ctx: Pick<PluginInput, "directory">,
  config: SecondBrainConfig,
  deps: CompactionInjectorDeps = {},
) {
  const root = config.path ?? join(ctx.directory, "Second_Brain");
  const maxChars = (config.max_inject_tokens ?? DEFAULT_MAX_TOKENS) * APPROX_CHARS_PER_TOKEN;
  const pinStore = deps.pinStore ?? secondBrainPinStore;
  const readTargetFn = deps.readTarget ?? readTarget;

  return {
    inject(sessionID: string): string {
      const targets = pinStore.list(sessionID);
      if (targets.length === 0) return "";
      if (!existsSync(root)) return "";

      const blocks: string[] = [];
      let budget = maxChars;
      for (const target of targets) {
        if (budget <= 0) break;
        const page = readTargetFn(root, target);
        if (!page) continue;
        const slice = page.length > budget ? page.slice(0, budget) : page;
        blocks.push(`## ${target}\n\n${slice}`);
        budget -= slice.length;
      }
      if (blocks.length === 0) return "";

      return `# Project memory (Second_Brain, pinned across compaction)\n\nRe-recalled from the project wiki; may be stale — verify against code.\n\n${blocks.join("\n\n")}`;
    },
  };
}
