import { existsSync } from "node:fs";
import { join } from "node:path";
import { tool, type PluginInput, type ToolDefinition } from "@opencode-ai/plugin";
import { readTarget, searchWiki, type ReadTargetOptions, type SearchOptions, type SearchResult } from "@oh-my-opencode/second-brain-core";
import type { SecondBrainConfig } from "../../config/schema/second-brain";
import { WIKI_READ_DESCRIPTION, WIKI_SEARCH_DESCRIPTION } from "./constants";
import { formatSearchResults } from "./format";

const DEFAULT_TOP = 10;

type WikiSearchArgs = { query: string; top?: number; folder?: string };
type WikiReadArgs = { target: string };

export type SecondBrainToolDeps = {
  searchWiki: (root: string, query: string, options?: SearchOptions) => SearchResult[];
  readTarget: (root: string, target: string, options?: ReadTargetOptions) => string | null;
};

const defaultDeps: SecondBrainToolDeps = { searchWiki, readTarget };

function resolveRoot(ctx: Pick<PluginInput, "directory">, config: SecondBrainConfig): string {
  return config.path ?? join(ctx.directory, "Second_Brain");
}

export function createSecondBrainTools(
  ctx: Pick<PluginInput, "directory">,
  config: SecondBrainConfig,
  deps: Partial<SecondBrainToolDeps> = {},
): Record<string, ToolDefinition> {
  const resolved: SecondBrainToolDeps = { ...defaultDeps, ...deps };
  const defaultTop = config.search_default_top ?? DEFAULT_TOP;

  const wiki_search: ToolDefinition = tool({
    description: WIKI_SEARCH_DESCRIPTION,
    args: {
      query: tool.schema.string().describe("Space-separated keywords; every keyword must appear (AND search)."),
      top: tool.schema.number().optional().describe(`Maximum number of results to return (default ${defaultTop}).`),
      folder: tool.schema.string().optional().describe('Restrict to a fragments subfolder (author), e.g. "felix".'),
    },
    async execute(args: WikiSearchArgs) {
      const root = resolveRoot(ctx, config);
      if (!existsSync(root)) return `No Second_Brain directory found at ${root}.`;
      try {
        const results = resolved.searchWiki(root, args.query, { top: args.top ?? defaultTop, folder: args.folder });
        return formatSearchResults(args.query, results);
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });

  const wiki_read: ToolDefinition = tool({
    description: WIKI_READ_DESCRIPTION,
    args: {
      target: tool.schema.string().describe('Wiki target/topic name, e.g. "second-brain-runtime".'),
    },
    async execute(args: WikiReadArgs) {
      const root = resolveRoot(ctx, config);
      if (!existsSync(root)) return `No Second_Brain directory found at ${root}.`;
      try {
        const page = resolved.readTarget(root, args.target);
        return page ?? `No Second_Brain wiki page for target "${args.target}". Try wiki_search first.`;
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });

  return { wiki_search, wiki_read };
}
