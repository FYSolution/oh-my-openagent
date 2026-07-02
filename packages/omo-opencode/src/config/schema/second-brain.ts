import { z } from "zod";

export const SecondBrainConfigSchema = z.object({
  /** Enable the Second_Brain wiki tools (wiki_search, wiki_read). Default false. */
  enabled: z.boolean().optional(),
  /** Override the Second_Brain directory. Default: <projectRoot>/Second_Brain. */
  path: z.string().optional(),
  /** Default number of results returned by wiki_search (1-50). Default 10. */
  search_default_top: z.number().min(1).max(50).optional(),
  /** Auto-inject the most relevant wiki page on knowledge-style questions. Default true when enabled. */
  inject_context: z.boolean().optional(),
  /** Hard cap (approx tokens) for auto-injected wiki context. Default 1500. */
  max_inject_tokens: z.number().min(100).max(20000).optional(),
  /**
   * When enabled and no Second_Brain/ exists in the project, scaffold a starter
   * one (folders + minimal files + index) on plugin startup. Default false.
   */
  auto_init: z.boolean().optional(),
});

export type SecondBrainConfig = z.infer<typeof SecondBrainConfigSchema>;
