import type { PluginInput } from "@opencode-ai/plugin";

/**
 * Known Edit tool error patterns that indicate the AI made a mistake.
 * Covers both the legacy string-edit tool and this plugin's hashline_edit
 * (hash mismatch, no-op, missing file, missing/invalid arguments).
 */
export const EDIT_ERROR_PATTERNS = [
  "oldString and newString must be different",
  "oldString not found",
  "oldString found multiple times",
  "mismatch",
  "No changes made",
  "File not found",
  "Missing required file path",
  "must be a non-empty array",
  "invalid arguments",
  "SchemaError",
] as const;

/**
 * After this many consecutive failed edit calls in one session, stop nudging
 * the model to retry the same tool and tell it to change approach instead.
 */
export const EDIT_ESCALATION_THRESHOLD = 2;

/**
 * System reminder injected when Edit tool fails due to AI mistake
 * Short, direct, and commanding - forces immediate corrective action
 */
export const EDIT_ERROR_REMINDER = `
[EDIT ERROR - IMMEDIATE ACTION REQUIRED]

You made an Edit mistake. STOP and do this NOW:

1. READ the file immediately to see its ACTUAL current state
2. VERIFY what the content really looks like (your assumption was wrong)
3. APOLOGIZE briefly to the user for the error
4. CONTINUE with corrected action based on the real file content

DO NOT attempt another edit until you've read and verified the file state.
`;

/**
 * Escalated reminder injected once edits have failed repeatedly in a row.
 * Forces the model off the failing edit path onto a reliable alternative
 * instead of burning turns on near-identical retries.
 */
export const EDIT_ESCALATION_REMINDER = `
[REPEATED EDIT FAILURES - CHANGE APPROACH NOW]

The edit tool has failed multiple times in a row. STOP retrying the same edit.
Switch strategy immediately - pick ONE:

1. RE-READ the exact target range to refresh the LINE#ID tags, then edit once with the real tags.
2. If edits keep failing, use the write tool to replace the ENTIRE file with the corrected content.
3. If the change is large or the file is unfamiliar, delegate the task to a subagent (task tool) to execute it directly.

DO NOT issue another near-identical edit call.
`;

/**
 * Detects Edit tool errors caused by AI mistakes and injects a recovery reminder.
 *
 * This hook catches common Edit tool failures:
 * - oldString and newString must be different (trying to "edit" to same content)
 * - oldString not found (wrong assumption about file content)
 * - oldString found multiple times (ambiguous match, need more context)
 * - hashline mismatch / no-op / missing file / missing file path (hashline_edit failures)
 *
 * First failure injects a "read and retry" reminder. Once failures pile up
 * within a session (>= EDIT_ESCALATION_THRESHOLD in a row), it escalates to a
 * "change approach" reminder so the model stops looping on the same edit.
 * A successful edit clears the streak.
 *
 * @see https://github.com/sst/opencode/issues/4718
 */
export function createEditErrorRecoveryHook(_ctx: PluginInput) {
  const consecutiveFailures = new Map<string, number>();

  return {
    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { title: string; output: string; metadata: unknown },
    ) => {
      if (input.tool.toLowerCase() !== "edit") return;
      if (typeof output.output !== "string") return;
      if (output.output.includes("[EDIT ERROR") || output.output.includes("[REPEATED EDIT FAILURES")) return;

      const outputLower = output.output.toLowerCase();
      const hasEditError = EDIT_ERROR_PATTERNS.some((pattern) => outputLower.includes(pattern.toLowerCase()));

      if (!hasEditError) {
        consecutiveFailures.delete(input.sessionID);
        return;
      }

      const failureCount = (consecutiveFailures.get(input.sessionID) ?? 0) + 1;
      consecutiveFailures.set(input.sessionID, failureCount);

      const reminder = failureCount >= EDIT_ESCALATION_THRESHOLD ? EDIT_ESCALATION_REMINDER : EDIT_ERROR_REMINDER;
      output.output += `\n${reminder}`;
    },
  };
}
