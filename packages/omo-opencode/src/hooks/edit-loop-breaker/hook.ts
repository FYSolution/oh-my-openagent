type TransformPart = {
  type?: string;
  tool?: string;
  text?: string;
  synthetic?: boolean;
  state?: {
    status?: string;
    error?: string;
    output?: string;
  };
  [key: string]: unknown;
};

type TransformMessageInfo = {
  role?: string;
  sessionID?: string;
  [key: string]: unknown;
};

type MessageWithParts = {
  info: TransformMessageInfo;
  parts: TransformPart[];
};

type EditLoopBreakerInput = {
  sessionID?: string;
  [key: string]: unknown;
};

type EditLoopBreakerOutput = {
  messages: MessageWithParts[];
};

export type EditLoopBreakerHook = {
  "experimental.chat.messages.transform"?: (input: EditLoopBreakerInput, output: EditLoopBreakerOutput) => Promise<void>;
};

/**
 * After this many rejected/failed edit calls since the last human turn, the
 * model is stuck retrying the same broken edit. Break the loop by injecting
 * guidance that forces a different approach.
 */
export const EDIT_LOOP_THRESHOLD = 2;

/**
 * After this many rejections the model has proven it cannot form a valid edit
 * call. Stop offering the "retry the edit" option entirely and forbid the tool.
 */
export const EDIT_LOOP_HARD_THRESHOLD = 4;

const EDIT_LOOP_MARKER = "[EDIT TOOL REPEATEDLY REJECTED";

/**
 * Guidance injected when the edit tool keeps getting rejected. Kept specific to
 * the common failure (missing/invalid arguments rejected BEFORE the tool runs,
 * so tool.execute.after recovery hooks never see it) and actionable.
 */
export const EDIT_LOOP_GUIDANCE = `${EDIT_LOOP_MARKER} - FIX ARGUMENTS OR CHANGE APPROACH]

Your recent edit calls were rejected before running because the arguments did not match the schema (for example a missing "filePath"). Retrying the same shape will keep failing. Do ONE of these NOW:

1. Re-issue the edit with the REQUIRED "filePath" key set to the absolute file path, plus a non-empty "edits" array.
2. If edits keep being rejected, use the write tool to replace the ENTIRE file with the corrected content.
3. If the change is large or the file is unfamiliar, delegate the task to a subagent via the task tool.

Do NOT repeat the same rejected edit call.`;

/**
 * Forceful guidance injected once edit rejections keep piling up past the hard
 * threshold. Deliberately removes the "retry the edit" option and forbids the
 * edit tool, because continuing to offer it is what keeps a weak model looping.
 */
export const EDIT_LOOP_GUIDANCE_HARD = `${EDIT_LOOP_MARKER} - STOP USING THE EDIT TOOL]

You have called the edit tool many times and every call was rejected before it ran. The edit tool is NOT working for this task. Do NOT call the edit tool again - retrying it will keep failing.

You MUST switch approach right now. Pick ONE and do it immediately:
- Use the write tool to write the ENTIRE corrected file contents in a single call.
- Or delegate this exact task to a subagent with the task tool and let it apply the change.

Calling edit again is forbidden. Respond by calling write or task now - do not just say you will.`;

const SCHEMA_REJECTION_SIGNATURES = ["edit tool was called with invalid arguments", "invalid arguments", "schemaerror", "missing key"] as const;

function collectPartText(part: TransformPart): string {
  const segments: string[] = [];
  if (typeof part.text === "string") segments.push(part.text);
  if (typeof part.state?.error === "string") segments.push(part.state.error);
  if (typeof part.state?.output === "string") segments.push(part.state.output);
  return segments.join("\n").toLowerCase();
}

function classifyEditPart(part: TransformPart): "error" | "success" | "none" {
  if (part.type === "tool" && part.tool === "edit" && part.state?.status === "completed") {
    return "success";
  }

  const text = collectPartText(part);
  if (text.length === 0) return "none";
  if (SCHEMA_REJECTION_SIGNATURES.some((signature) => text.includes(signature))) {
    return "error";
  }
  return "none";
}

function messageHasMarker(message: MessageWithParts): boolean {
  return message.parts.some((part) => part.synthetic === true && typeof part.text === "string" && part.text.includes(EDIT_LOOP_MARKER));
}

function isRealUserMessage(message: MessageWithParts): boolean {
  return message.info.role === "user" && message.parts.some((part) => part.synthetic !== true);
}

function findLastRealUserIndex(messages: MessageWithParts[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message && isRealUserMessage(message)) return index;
  }
  return 0;
}

function resolveSessionID(input: EditLoopBreakerInput, messages: MessageWithParts[]): string | undefined {
  if (typeof input.sessionID === "string" && input.sessionID.length > 0) {
    return input.sessionID;
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const sessionID = messages[index]?.info.sessionID;
    if (typeof sessionID === "string" && sessionID.length > 0) return sessionID;
  }
  return undefined;
}

function createGuidanceMessage(sessionID: string | undefined, guidance: string): MessageWithParts {
  return {
    info: { role: "user", sessionID },
    parts: [{ type: "text", text: guidance, synthetic: true }],
  };
}

/**
 * Detects when the edit tool is stuck failing repeatedly and injects a
 * change-approach instruction into the message stream.
 *
 * This lives on `experimental.chat.messages.transform` on purpose: edit
 * argument-schema rejections happen BEFORE the tool executes, so the
 * `tool.execute.after` recovery hooks never observe them. The rejection text
 * does land in the conversation history, which this hook can see.
 */
export function createEditLoopBreakerHook(config: { enabled: boolean }): EditLoopBreakerHook {
  return {
    "experimental.chat.messages.transform": async (input, output): Promise<void> => {
      if (!config.enabled) return;
      const messages = output.messages;
      if (messages.length === 0) return;

      const lastMessage = messages.at(-1);
      if (lastMessage && messageHasMarker(lastMessage)) return;

      const startIndex = findLastRealUserIndex(messages);

      let errorStreak = 0;
      let lastEditClass: "error" | "success" | undefined;
      for (let index = startIndex; index < messages.length; index += 1) {
        for (const part of messages[index]?.parts ?? []) {
          const classification = classifyEditPart(part);
          if (classification === "error") {
            errorStreak += 1;
            lastEditClass = "error";
          } else if (classification === "success") {
            errorStreak = 0;
            lastEditClass = "success";
          }
        }
      }

      if (errorStreak >= EDIT_LOOP_THRESHOLD && lastEditClass === "error") {
        const guidance = errorStreak >= EDIT_LOOP_HARD_THRESHOLD ? EDIT_LOOP_GUIDANCE_HARD : EDIT_LOOP_GUIDANCE;
        messages.push(createGuidanceMessage(resolveSessionID(input, messages), guidance));
      }
    },
  };
}
