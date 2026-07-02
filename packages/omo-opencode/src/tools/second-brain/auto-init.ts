import { join } from "node:path";
import { scaffoldSecondBrain } from "@oh-my-opencode/second-brain-core";
import type { SecondBrainConfig } from "../../config/schema/second-brain";
import { log } from "../../shared/logger";

// R6 auto-init: when second_brain is enabled with auto_init, scaffold a starter
// Second_Brain/ at plugin startup so the client never has to set it up by hand.
// When an older Second_Brain/ already exists, merge in only the missing pieces
// (dirs, top-level files, SCHEMA sections, compiled index) without overwriting
// existing content. Gated, idempotent, and failure-safe.

function resolveUser(): string {
  return process.env.SECOND_BRAIN_USER?.trim() || "user";
}

export function maybeAutoInitSecondBrain(directory: string, config: SecondBrainConfig | undefined): boolean {
  if (config?.enabled !== true || config.auto_init !== true) return false;

  const root = config.path ?? join(directory, "Second_Brain");

  try {
    const result = scaffoldSecondBrain(root, { user: resolveUser() });
    if (result.created) {
      log("[second-brain-init] Scaffolded Second_Brain", { root });
    } else if (result.merged) {
      log("[second-brain-init] Merged missing pieces into existing Second_Brain", { root, added: result.added });
    }
    return result.created || result.merged;
  } catch (error) {
    log("[second-brain-init] Scaffold failed", { root, error: String(error) });
    return false;
  }
}
