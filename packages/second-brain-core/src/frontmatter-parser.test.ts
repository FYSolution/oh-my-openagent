import { describe, expect, test } from "bun:test";
import { parseFrontmatter } from "./frontmatter-parser";

describe("parseFrontmatter", () => {
  test("#given a single-line flow array #then it is parsed as an array", () => {
    const { frontmatter } = parseFrontmatter("---\ncode_anchors: [a#L1-L2@x, b#L3-L4@y]\n---\nbody");
    expect(frontmatter.code_anchors).toEqual(["a#L1-L2@x", "b#L3-L4@y"]);
  });

  test("#given a formatter-reflowed multiline array #then continuation lines are merged", () => {
    const text = ["---", "code_anchors:", "  [", "    a#L1-L2@x,", "    b#L3-L4@y,", "  ]", "---", "body"].join("\n");
    const { frontmatter } = parseFrontmatter(text);
    expect(frontmatter.code_anchors).toEqual(["a#L1-L2@x", "b#L3-L4@y"]);
  });

  test("#given a quoted scalar #then quotes are stripped", () => {
    const { frontmatter } = parseFrontmatter('---\ntitle: "hello world"\n---');
    expect(frontmatter.title).toBe("hello world");
  });

  test("#given a trailing comma #then the empty element is filtered", () => {
    const { frontmatter } = parseFrontmatter("---\ntags: [a, b, ]\n---");
    expect(frontmatter.tags).toEqual(["a", "b"]);
  });

  test("#given frontmatter #then the body follows the closing delimiter", () => {
    const { body } = parseFrontmatter("---\ntype: entity\n---\n# Title\n\ntext");
    expect(body).toBe("# Title\n\ntext");
  });
});
