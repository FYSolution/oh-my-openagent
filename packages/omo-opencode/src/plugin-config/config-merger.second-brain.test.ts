import { describe, expect, it } from "bun:test";
import { OhMyOpenCodeConfigSchema } from "../config/schema/oh-my-opencode-config";
import { mergeConfigs } from "./config-merger";

describe("mergeConfigs second_brain", () => {
  it("#given a base and an override that each set some second_brain fields #when merged #then the block is deep-merged", () => {
    // given
    const base = OhMyOpenCodeConfigSchema.parse({
      second_brain: { enabled: true, auto_init: true, path: "/base/Second_Brain" },
    });
    const override = OhMyOpenCodeConfigSchema.parse({
      second_brain: { enabled: true, search_default_top: 25 },
    });

    // when
    const merged = mergeConfigs(base, override);

    // then — override wins on overlap, base survives where the override is silent
    expect(merged.second_brain?.auto_init).toBe(true);
    expect(merged.second_brain?.path).toBe("/base/Second_Brain");
    expect(merged.second_brain?.search_default_top).toBe(25);
  });

  it("#given neither layer sets second_brain #when merged #then it stays undefined", () => {
    // given
    const base = OhMyOpenCodeConfigSchema.parse({});
    const override = OhMyOpenCodeConfigSchema.parse({});

    // when
    const merged = mergeConfigs(base, override);

    // then
    expect(merged.second_brain).toBeUndefined();
  });
});
