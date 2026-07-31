import { describe, it, expect, beforeEach } from "bun:test";
import { createEditErrorRecoveryHook, EDIT_ERROR_REMINDER, EDIT_ERROR_PATTERNS, EDIT_ESCALATION_REMINDER } from "./index";
import { unsafeTestValue } from "../../../../../test-support/unsafe-test-value";

describe("createEditErrorRecoveryHook", () => {
  let hook: ReturnType<typeof createEditErrorRecoveryHook>;

  beforeEach(() => {
    hook = createEditErrorRecoveryHook(unsafeTestValue({}));
  });

  describe("tool.execute.after", () => {
    const createInput = (tool: string) => ({
      tool,
      sessionID: "test-session",
      callID: "test-call-id",
    });

    const createOutput = (outputText: string) => ({
      title: "Edit",
      output: outputText,
      metadata: {},
    });

    describe("#given Edit tool with oldString/newString same error", () => {
      describe("#when the error message is detected", () => {
        it("#then should append the recovery reminder", async () => {
          const input = createInput("Edit");
          const output = createOutput("Error: oldString and newString must be different");

          await hook["tool.execute.after"](input, output);

          expect(output.output).toContain(EDIT_ERROR_REMINDER);
          expect(output.output).toContain("oldString and newString must be different");
        });
      });

      describe("#when the error appears without Error prefix", () => {
        it("#then should still detect and append reminder", async () => {
          const input = createInput("Edit");
          const output = createOutput("oldString and newString must be different");

          await hook["tool.execute.after"](input, output);

          expect(output.output).toContain(EDIT_ERROR_REMINDER);
        });
      });
    });

    describe("#given Edit tool with oldString not found error", () => {
      describe("#when oldString not found in content", () => {
        it("#then should append the recovery reminder", async () => {
          const input = createInput("Edit");
          const output = createOutput("Error: oldString not found in content");

          await hook["tool.execute.after"](input, output);

          expect(output.output).toContain(EDIT_ERROR_REMINDER);
        });
      });
    });

    describe("#given Edit tool with multiple matches error", () => {
      describe("#when oldString found multiple times", () => {
        it("#then should append the recovery reminder", async () => {
          const input = createInput("Edit");
          const output = createOutput("Error: oldString found multiple times and requires more code context to uniquely identify the intended match");

          await hook["tool.execute.after"](input, output);

          expect(output.output).toContain(EDIT_ERROR_REMINDER);
        });
      });
    });

    describe("#given non-Edit tool", () => {
      describe("#when tool is not Edit", () => {
        it("#then should not modify output", async () => {
          const input = createInput("Read");
          const originalOutput = "some output";
          const output = createOutput(originalOutput);

          await hook["tool.execute.after"](input, output);

          expect(output.output).toBe(originalOutput);
        });
      });
    });

    describe("#given Edit tool with successful output", () => {
      describe("#when no error in output", () => {
        it("#then should not modify output", async () => {
          const input = createInput("Edit");
          const originalOutput = "File edited successfully";
          const output = createOutput(originalOutput);

          await hook["tool.execute.after"](input, output);

          expect(output.output).toBe(originalOutput);
        });
      });
    });

    describe("#given MCP tool with undefined output.output", () => {
      describe("#when output.output is undefined", () => {
        it("#then should not crash", async () => {
          const input = createInput("Edit");
          const output = {
            title: "Edit",
            output: unsafeTestValue<string>(undefined),
            metadata: {},
          };

          await hook["tool.execute.after"](input, output);

          expect(output.output).toBeUndefined();
        });
      });
    });

    describe("#given case insensitive tool name", () => {
      describe("#when tool is 'edit' lowercase", () => {
        it("#then should still detect and append reminder", async () => {
          const input = createInput("edit");
          const output = createOutput("oldString and newString must be different");

          await hook["tool.execute.after"](input, output);

          expect(output.output).toContain(EDIT_ERROR_REMINDER);
        });
      });
    });
  });

  describe("EDIT_ERROR_PATTERNS", () => {
    it("#then should contain all known Edit error patterns", () => {
      expect(EDIT_ERROR_PATTERNS).toContain("oldString and newString must be different");
      expect(EDIT_ERROR_PATTERNS).toContain("oldString not found");
      expect(EDIT_ERROR_PATTERNS).toContain("oldString found multiple times");
    });
  });

  describe("escalation on repeated failures", () => {
    const createInput = (tool: string) => ({
      tool,
      sessionID: "escalation-session",
      callID: "call",
    });
    const createOutput = (outputText: string) => ({
      title: "Edit",
      output: outputText,
      metadata: {},
    });

    it("#then escalates to change-approach reminder after the threshold", async () => {
      //#given first failure gets the standard reminder
      const first = createOutput("Error: >>> mismatch at 12#AB");
      await hook["tool.execute.after"](createInput("edit"), first);
      expect(first.output).toContain(EDIT_ERROR_REMINDER);

      //#when a second consecutive failure occurs
      const second = createOutput("Error: >>> mismatch at 12#AB");
      await hook["tool.execute.after"](createInput("edit"), second);

      //#then the escalation reminder is injected instead
      expect(second.output).toContain(EDIT_ESCALATION_REMINDER);
      expect(second.output).not.toContain(EDIT_ERROR_REMINDER);
    });

    it("#then a successful edit clears the failure streak", async () => {
      //#given one failure recorded
      await hook["tool.execute.after"](createInput("edit"), createOutput("Error: File not found: x"));

      //#when a successful edit runs
      await hook["tool.execute.after"](createInput("edit"), createOutput("Updated x"));

      //#then the next failure starts fresh with the standard reminder
      const next = createOutput("Error: File not found: x");
      await hook["tool.execute.after"](createInput("edit"), next);
      expect(next.output).toContain(EDIT_ERROR_REMINDER);
      expect(next.output).not.toContain(EDIT_ESCALATION_REMINDER);
    });

    it("#then recognizes hashline missing-file-path errors", async () => {
      //#given a hashline missing-path failure
      const output = createOutput('Error: Missing required file path. Provide the absolute path as "filePath".');

      //#when the hook runs
      await hook["tool.execute.after"](createInput("edit"), output);

      //#then the recovery reminder is injected
      expect(output.output).toContain(EDIT_ERROR_REMINDER);
    });
  });
});
