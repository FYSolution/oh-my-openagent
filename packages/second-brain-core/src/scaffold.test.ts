import { describe, expect, it, afterEach } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scaffoldSecondBrain } from "./scaffold";
import { loadFragments } from "./fragment-loader";

const dirs: string[] = [];
function freshRoot(): string {
  const base = mkdtempSync(join(tmpdir(), "omo-sb-scaffold-"));
  dirs.push(base);
  return join(base, "Second_Brain");
}

afterEach(() => {
  while (dirs.length) {
    const d = dirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

describe("scaffoldSecondBrain", () => {
  it("#given an absent root #when scaffolded #then creates the tree, files and index", () => {
    // given
    const root = freshRoot();
    const now = new Date(2026, 6, 1, 12, 0, 0);

    // when
    const result = scaffoldSecondBrain(root, { user: "Felix Yang", now });

    // then
    expect(result.created).toBe(true);
    expect(existsSync(join(root, ".gitignore"))).toBe(true);
    expect(existsSync(join(root, "SCHEMA.md"))).toBe(true);
    expect(existsSync(join(root, "wiki", "fragments", "felix-yang", "getting-started.md"))).toBe(true);
    expect(existsSync(join(root, "wiki", "log", "felix-yang", "2026-07-01.md"))).toBe(true);
    expect(existsSync(join(root, "wiki", ".compiled", "_manifest.json"))).toBe(true);
  });

  it("#given the seed fragment #when loaded #then it parses with a target", () => {
    // given
    const root = freshRoot();
    scaffoldSecondBrain(root, { user: "felix", now: new Date(2026, 6, 1, 12, 0, 0) });

    // when
    const fragments = loadFragments(root);

    // then
    expect(fragments.length).toBe(1);
    expect(fragments[0]?.frontmatter.target).toBe("getting-started");
    expect(fragments[0]?.frontmatter.type).toBe("overview");
  });

  it("#given a user with no name #when scaffolded #then falls back to 'user'", () => {
    // given
    const root = freshRoot();

    // when
    scaffoldSecondBrain(root, { user: "   ", now: new Date(2026, 6, 1, 12, 0, 0) });

    // then
    expect(existsSync(join(root, "wiki", "fragments", "user", "getting-started.md"))).toBe(true);
  });

  it("#given an existing root #when scaffolded again #then it is a no-op and preserves content", () => {
    // given
    const root = freshRoot();
    scaffoldSecondBrain(root, { user: "felix", now: new Date(2026, 6, 1, 12, 0, 0) });
    const seedPath = join(root, "wiki", "fragments", "felix", "getting-started.md");
    const before = readFileSync(seedPath, "utf8");

    // when
    const second = scaffoldSecondBrain(root, { user: "felix", now: new Date(2026, 6, 2, 12, 0, 0) });

    // then
    expect(second.created).toBe(false);
    expect(second.merged).toBe(false);
    expect(second.added).toEqual([]);
    expect(readFileSync(seedPath, "utf8")).toBe(before);
  });

  it("#given an existing brain missing dirs and files #when scaffolded #then it merges only the missing pieces", () => {
    // given — an old brain with just a SCHEMA.md and one fragment, no .gitignore, no log dir
    const root = freshRoot();
    const fragmentsDir = join(root, "wiki", "fragments", "felix");
    mkdirSync(fragmentsDir, { recursive: true });
    const oldSchema = "# Legacy Schema\n\n## Custom\n\nHand written.\n";
    writeFileSync(join(root, "SCHEMA.md"), oldSchema, "utf8");
    const existingFragment = join(fragmentsDir, "notes.md");
    writeFileSync(existingFragment, "existing note\n", "utf8");
    const fragmentBefore = readFileSync(existingFragment, "utf8");

    // when
    const result = scaffoldSecondBrain(root, { user: "felix", now: new Date(2026, 6, 2, 12, 0, 0) });

    // then
    expect(result.created).toBe(false);
    expect(result.merged).toBe(true);
    expect(existsSync(join(root, ".gitignore"))).toBe(true);
    expect(existsSync(join(root, "wiki", "log", "felix"))).toBe(true);
    expect(existsSync(join(root, "raw", "code-updates"))).toBe(true);
    expect(existsSync(join(root, "wiki", ".compiled", "_manifest.json"))).toBe(true);
    // never overwrite existing content
    expect(readFileSync(existingFragment, "utf8")).toBe(fragmentBefore);
    // established fragment space is not polluted with the starter note
    expect(existsSync(join(fragmentsDir, "getting-started.md"))).toBe(false);
  });

  it("#given an existing SCHEMA #when scaffolded #then missing starter sections are appended, existing kept", () => {
    // given
    const root = freshRoot();
    mkdirSync(root, { recursive: true });
    const oldSchema = "# Legacy Schema\n\n## Custom\n\nHand written rules that must survive.\n";
    writeFileSync(join(root, "SCHEMA.md"), oldSchema, "utf8");

    // when
    const result = scaffoldSecondBrain(root, { user: "felix", now: new Date(2026, 6, 2, 12, 0, 0) });

    // then
    const schema = readFileSync(join(root, "SCHEMA.md"), "utf8");
    expect(result.merged).toBe(true);
    expect(result.added).toContain("SCHEMA.md#sections");
    expect(schema).toContain("Hand written rules that must survive.");
    expect(schema).toContain("## Layout");
    expect(schema).toContain("## Fragment frontmatter");
  });
});
