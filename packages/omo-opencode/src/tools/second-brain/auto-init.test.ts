import { describe, expect, it, afterEach } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { maybeAutoInitSecondBrain } from "./auto-init";

const dirs: string[] = [];
function freshProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "omo-sb-autoinit-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  while (dirs.length) {
    const d = dirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

describe("maybeAutoInitSecondBrain", () => {
  it("#given disabled config #when called #then does nothing", () => {
    // given
    const dir = freshProject();

    // when
    const created = maybeAutoInitSecondBrain(dir, { enabled: false, auto_init: true });

    // then
    expect(created).toBe(false);
    expect(existsSync(join(dir, "Second_Brain"))).toBe(false);
  });

  it("#given enabled without auto_init #when called #then does nothing", () => {
    // given
    const dir = freshProject();

    // when
    const created = maybeAutoInitSecondBrain(dir, { enabled: true });

    // then
    expect(created).toBe(false);
    expect(existsSync(join(dir, "Second_Brain"))).toBe(false);
  });

  it("#given enabled + auto_init + no folder #when called #then scaffolds Second_Brain", () => {
    // given
    const dir = freshProject();

    // when
    const created = maybeAutoInitSecondBrain(dir, { enabled: true, auto_init: true });

    // then
    expect(created).toBe(true);
    expect(existsSync(join(dir, "Second_Brain", "SCHEMA.md"))).toBe(true);
    expect(existsSync(join(dir, "Second_Brain", "wiki", ".compiled", "_manifest.json"))).toBe(true);
  });

  it("#given a complete Second_Brain #when called again #then nothing is merged", () => {
    // given
    const dir = freshProject();
    maybeAutoInitSecondBrain(dir, { enabled: true, auto_init: true });

    // when
    const second = maybeAutoInitSecondBrain(dir, { enabled: true, auto_init: true });

    // then
    expect(second).toBe(false);
  });

  it("#given an old Second_Brain missing pieces #when called #then merges in the missing pieces", () => {
    // given — a bare legacy brain: just the root dir, no files
    const dir = freshProject();
    mkdirSync(join(dir, "Second_Brain"), { recursive: true });

    // when
    const merged = maybeAutoInitSecondBrain(dir, { enabled: true, auto_init: true });

    // then
    expect(merged).toBe(true);
    expect(existsSync(join(dir, "Second_Brain", "SCHEMA.md"))).toBe(true);
    expect(existsSync(join(dir, "Second_Brain", "wiki", ".compiled", "_manifest.json"))).toBe(true);
  });
});
