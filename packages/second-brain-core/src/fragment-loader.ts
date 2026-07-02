import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { parseFrontmatter } from "./frontmatter-parser";
import type { Fragment } from "./types";

export function fragmentsRootOf(secondBrainRoot: string): string {
  return join(secondBrainRoot, "wiki", "fragments");
}

function walkMarkdown(dir: string, acc: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkMarkdown(full, acc);
    } else if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md") {
      acc.push(full);
    }
  }
}

export function listFragmentFiles(secondBrainRoot: string): string[] {
  const root = fragmentsRootOf(secondBrainRoot);
  if (!existsSync(root)) return [];
  const files: string[] = [];
  walkMarkdown(root, files);
  files.sort();
  return files;
}

export function loadFragments(secondBrainRoot: string): Fragment[] {
  const root = fragmentsRootOf(secondBrainRoot);
  return listFragmentFiles(secondBrainRoot).map((filePath) => {
    const { frontmatter, body } = parseFrontmatter(readFileSync(filePath, "utf8"));
    const relPath = relative(root, filePath).split(sep).join("/");
    const fileName = relPath.split("/").pop() ?? relPath;
    const user = relPath.split("/")[0];
    return { frontmatter, body, filePath, relPath, fileName, user, mtimeMs: statSync(filePath).mtimeMs };
  });
}
