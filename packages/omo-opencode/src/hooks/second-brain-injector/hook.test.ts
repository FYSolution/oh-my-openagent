import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import type { RegisterContextOptions } from "../../features/context-injector";
import { createSecondBrainInjectorHook, looksLikeKnowledgeQuery } from "./hook";
import { SecondBrainPinStore } from "./pin-store";

const FIXTURE_ROOT = join(import.meta.dir, "..", "..", "..", "..", "..", "test-support", "second-brain-fixtures", "basic", "Second_Brain");

type Recorded = { sessionID: string; options: RegisterContextOptions };

function makeCollector() {
  const calls: Recorded[] = [];
  return {
    calls,
    register(sessionID: string, options: RegisterContextOptions) {
      calls.push({ sessionID, options });
    },
  };
}

function textPart(text: string) {
  return { type: "text", text };
}

describe("looksLikeKnowledgeQuery", () => {
  test("#given a question #when checked #then true", () => {
    expect(looksLikeKnowledgeQuery("how does gizmo work?")).toBe(true);
    expect(looksLikeKnowledgeQuery("what is the widget")).toBe(true);
  });

  test("#given an imperative work prompt #when checked #then false", () => {
    expect(looksLikeKnowledgeQuery("refactor the gizmo module")).toBe(false);
    expect(looksLikeKnowledgeQuery("")).toBe(false);
  });
});

describe("createSecondBrainInjectorHook", () => {
  const config = { enabled: true, path: FIXTURE_ROOT };

  test("#given a knowledge query with a wiki match #when handled #then registers context", async () => {
    // given
    const collector = makeCollector();
    const pinStore = new SecondBrainPinStore();
    const hook = createSecondBrainInjectorHook({ directory: "." }, config, collector, pinStore);

    // when
    await hook["chat.message"]({ sessionID: "s1" }, { parts: [textPart("how does gizmo internals work?")] });

    // then
    expect(collector.calls.length).toBe(1);
    expect(collector.calls[0]?.options.source).toBe("second-brain");
    expect(collector.calls[0]?.options.priority).toBe("low");
    expect(collector.calls[0]?.options.content).toContain("Project memory: gizmo");
    expect(pinStore.list("s1")).toContain("gizmo");
  });

  test("#given a non-question prompt #when handled #then registers nothing", async () => {
    // given
    const collector = makeCollector();
    const hook = createSecondBrainInjectorHook({ directory: "." }, config, collector);

    // when
    await hook["chat.message"]({ sessionID: "s1" }, { parts: [textPart("refactor the gizmo module now")] });

    // then
    expect(collector.calls.length).toBe(0);
  });

  test("#given a query with no wiki match #when handled #then registers nothing", async () => {
    // given
    const collector = makeCollector();
    const hook = createSecondBrainInjectorHook({ directory: "." }, config, collector);

    // when
    await hook["chat.message"]({ sessionID: "s1" }, { parts: [textPart("what is zzzznomatchquery?")] });

    // then
    expect(collector.calls.length).toBe(0);
  });
});
