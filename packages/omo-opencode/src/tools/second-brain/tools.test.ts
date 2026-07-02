import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { ToolContext } from "@opencode-ai/plugin/tool";
import { readTarget, searchWiki } from "@oh-my-opencode/second-brain-core";
import { unsafeTestValue } from "../../../../../test-support/unsafe-test-value";
import { createSecondBrainTools } from "./tools";

const NOW = new Date(2026, 6, 1, 16, 7, 10);
const CONTEXT = unsafeTestValue<ToolContext>({ sessionID: "test", messageID: "test", agent: "test", abort: new AbortController().signal });
const FIXTURE_ROOT = join(import.meta.dir, "..", "..", "..", "..", "..", "test-support", "second-brain-fixtures", "basic", "Second_Brain");

function text(result: string | { output: string }): string {
  return typeof result === "string" ? result : result.output;
}

function makeTools() {
  return createSecondBrainTools(
    { directory: FIXTURE_ROOT },
    { enabled: true, path: FIXTURE_ROOT },
    {
      searchWiki: (root, query, options) => searchWiki(root, query, { ...options, now: NOW }),
      readTarget: (root, target, options) => readTarget(root, target, { ...options, now: NOW }),
    },
  );
}

describe("createSecondBrainTools", () => {
  test("#given a matching keyword #when wiki_search runs #then it returns a ranked markdown table", async () => {
    // given
    const tools = makeTools();
    // when
    const out = text(await tools.wiki_search.execute({ query: "widget" }, CONTEXT));
    // then
    expect(out).toContain("Second_Brain wiki fragment(s)");
    expect(out).toContain("| Score | State | File | Match |");
    expect(out).toContain("wiki/fragments/");
  });

  test("#given a no-match query #when wiki_search runs #then it reports no matches", async () => {
    // given
    const tools = makeTools();
    // when
    const out = text(await tools.wiki_search.execute({ query: "zzzznotpresent" }, CONTEXT));
    // then
    expect(out).toContain("No Second_Brain wiki fragments matched");
  });

  test("#given a known target #when wiki_read runs #then it returns the assembled page", async () => {
    // given
    const tools = makeTools();
    // when
    const out = text(await tools.wiki_read.execute({ target: "widget" }, CONTEXT));
    // then
    expect(out).toContain("widget");
  });

  test("#given an unknown target #when wiki_read runs #then it suggests wiki_search", async () => {
    // given
    const tools = makeTools();
    // when
    const out = text(await tools.wiki_read.execute({ target: "nonexistent-topic" }, CONTEXT));
    // then
    expect(out).toContain("Try wiki_search first");
  });

  test("#given a missing Second_Brain directory #when a tool runs #then it reports the absence", async () => {
    // given
    const tools = createSecondBrainTools({ directory: "/no/such/place" }, { enabled: true, path: "/no/such/place/Second_Brain" });
    // when
    const out = text(await tools.wiki_search.execute({ query: "widget" }, CONTEXT));
    // then
    expect(out).toContain("No Second_Brain directory found");
  });
});
