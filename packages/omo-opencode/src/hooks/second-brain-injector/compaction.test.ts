import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { readTarget } from "@oh-my-opencode/second-brain-core";

import { createSecondBrainCompactionInjector } from "./compaction";
import { SecondBrainPinStore } from "./pin-store";

const FIXTURE_ROOT = join(import.meta.dir, "..", "..", "..", "..", "..", "test-support", "second-brain-fixtures", "basic", "Second_Brain");

const NOW = new Date(2026, 6, 1, 16, 7, 10);

describe("SecondBrainPinStore", () => {
  test("#given records for a session #when listed #then returns unique targets", () => {
    // given
    const store = new SecondBrainPinStore();
    store.record("s1", "gizmo");
    store.record("s1", "gizmo");
    store.record("s1", "widget");

    // then
    expect(store.list("s1").sort()).toEqual(["gizmo", "widget"]);
    expect(store.list("other")).toEqual([]);
  });

  test("#given a cleared session #when listed #then empty", () => {
    // given
    const store = new SecondBrainPinStore();
    store.record("s1", "gizmo");

    // when
    store.clear("s1");

    // then
    expect(store.list("s1")).toEqual([]);
  });
});

describe("createSecondBrainCompactionInjector", () => {
  const config = { enabled: true, path: FIXTURE_ROOT };

  test("#given pinned targets #when inject #then re-emits the current pages", () => {
    // given
    const store = new SecondBrainPinStore();
    store.record("s1", "gizmo");
    const injector = createSecondBrainCompactionInjector({ directory: "." }, config, {
      pinStore: store,
      readTarget: (root, target) => (target === "gizmo" ? "GIZMO PAGE BODY" : null),
    });

    // when
    const context = injector.inject("s1");

    // then
    expect(context).toContain("pinned across compaction");
    expect(context).toContain("## gizmo");
    expect(context).toContain("GIZMO PAGE BODY");
  });

  test("#given no pins for the session #when inject #then returns empty string", () => {
    // given
    const store = new SecondBrainPinStore();
    const injector = createSecondBrainCompactionInjector({ directory: "." }, config, {
      pinStore: store,
    });

    // then
    expect(injector.inject("s1")).toBe("");
  });

  test("#given a removed target #when inject #then drops it", () => {
    // given
    const store = new SecondBrainPinStore();
    store.record("s1", "ghost");
    const injector = createSecondBrainCompactionInjector({ directory: "." }, config, {
      pinStore: store,
      readTarget: () => null,
    });

    // then
    expect(injector.inject("s1")).toBe("");
  });

  test("#given a real fixture target #when inject #then reads the compiled page", () => {
    // given
    const store = new SecondBrainPinStore();
    store.record("s1", "gizmo");
    const injector = createSecondBrainCompactionInjector({ directory: "." }, config, {
      pinStore: store,
      readTarget: (root, target) => readTarget(root, target, { now: NOW }),
    });

    // when
    const context = injector.inject("s1");

    // then
    expect(context).toContain("## gizmo");
    expect(context.length).toBeGreaterThan(0);
  });
});
