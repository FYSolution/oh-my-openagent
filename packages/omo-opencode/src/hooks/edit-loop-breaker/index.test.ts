import { describe, it, expect } from "bun:test";
import { createEditLoopBreakerHook, EDIT_LOOP_GUIDANCE, EDIT_LOOP_GUIDANCE_HARD } from "./index";

type Part = {
  type?: string;
  tool?: string;
  text?: string;
  synthetic?: boolean;
  state?: { status?: string; error?: string; output?: string };
};
type Message = { info: { role?: string; sessionID?: string }; parts: Part[] };

function userMessage(text: string): Message {
  return { info: { role: "user", sessionID: "s1" }, parts: [{ type: "text", text }] };
}

function editErrorMessage(): Message {
  return {
    info: { role: "assistant", sessionID: "s1" },
    parts: [
      {
        type: "tool",
        tool: "edit",
        state: {
          status: "error",
          error: 'The edit tool was called with invalid arguments: SchemaError(Missing key at ["filePath"]).',
        },
      },
    ],
  };
}

function editSuccessMessage(): Message {
  return {
    info: { role: "assistant", sessionID: "s1" },
    parts: [{ type: "tool", tool: "edit", state: { status: "completed", output: "Updated /a.ts" } }],
  };
}

async function run(messages: Message[]): Promise<Message[]> {
  const hook = createEditLoopBreakerHook({ enabled: true });
  const output = { messages };
  await hook["experimental.chat.messages.transform"]?.({ sessionID: "s1" }, output);
  return output.messages;
}

describe("createEditLoopBreakerHook", () => {
  it("#then injects guidance after two consecutive edit rejections", async () => {
    //#given two edit schema rejections since the last user turn
    const messages = [userMessage("edit the file"), editErrorMessage(), editErrorMessage()];

    //#when the transform runs
    const result = await run(messages);

    //#then a change-approach guidance message is appended
    const last = result.at(-1);
    expect(last?.parts[0]?.text).toBe(EDIT_LOOP_GUIDANCE);
    expect(last?.parts[0]?.synthetic).toBe(true);
  });

  it("#then escalates to a forbid-edit message after the hard threshold", async () => {
    //#given four edit rejections since the last user turn
    const messages = [userMessage("edit the file"), editErrorMessage(), editErrorMessage(), editErrorMessage(), editErrorMessage()];

    //#when the transform runs
    const result = await run(messages);

    //#then the forceful stop-using-edit guidance is injected instead of the soft one
    const last = result.at(-1);
    expect(last?.parts[0]?.text).toBe(EDIT_LOOP_GUIDANCE_HARD);
    expect(last?.parts[0]?.text).not.toBe(EDIT_LOOP_GUIDANCE);
  });

  it("#then does not inject after a single failure", async () => {
    //#given only one failure
    const messages = [userMessage("edit"), editErrorMessage()];

    //#when the transform runs
    const result = await run(messages);

    //#then nothing is injected
    expect(result).toHaveLength(2);
  });

  it("#then a successful edit clears the streak", async () => {
    //#given two failures then a success
    const messages = [userMessage("edit"), editErrorMessage(), editErrorMessage(), editSuccessMessage()];

    //#when the transform runs
    const result = await run(messages);

    //#then no guidance is injected
    expect(result).toHaveLength(4);
  });

  it("#then is idempotent when guidance already at the tail", async () => {
    //#given guidance already injected
    const messages = [userMessage("edit"), editErrorMessage(), editErrorMessage()];
    const once = await run(messages);
    expect(once).toHaveLength(4);

    //#when the transform runs again on the same messages
    const twice = await run(once);

    //#then no second guidance message is appended
    expect(twice).toHaveLength(4);
  });

  it("#then detects rejection text even without a structured tool part", async () => {
    //#given errors surfaced as plain text parts
    const textError: Message = {
      info: { role: "assistant", sessionID: "s1" },
      parts: [{ type: "text", text: "The edit tool was called with invalid arguments: SchemaError" }],
    };
    const messages = [userMessage("edit"), textError, { ...textError }];

    //#when the transform runs
    const result = await run(messages);

    //#then guidance is injected
    expect(result.at(-1)?.parts[0]?.text).toBe(EDIT_LOOP_GUIDANCE);
  });
});
