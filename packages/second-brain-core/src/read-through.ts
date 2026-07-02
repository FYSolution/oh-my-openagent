import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { listFragmentFiles, loadFragments } from "./fragment-loader";
import { buildManifest } from "./indexer";
import { stripBom } from "./text-lines";
import type { Manifest } from "./types";

export interface LoadIndexOptions {
  now?: Date;
  persist?: boolean;
  forceRebuild?: boolean;
}

function manifestPath(secondBrainRoot: string): string {
  return join(secondBrainRoot, "wiki", ".compiled", "_manifest.json");
}

function newestFragmentMtime(secondBrainRoot: string): number | null {
  const files = listFragmentFiles(secondBrainRoot);
  if (files.length === 0) return null;
  let newest = 0;
  for (const file of files) {
    const mtime = statSync(file).mtimeMs;
    if (mtime > newest) newest = mtime;
  }
  return newest;
}

function tryReadManifest(path: string): Manifest | null {
  try {
    return JSON.parse(stripBom(readFileSync(path, "utf8"))) as Manifest;
  } catch {
    return null;
  }
}

export function persistIndex(secondBrainRoot: string, manifest: Manifest): void {
  const path = manifestPath(secondBrainRoot);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(manifest, null, 2), "utf8");
  renameSync(tmp, path);
}

export function rebuildIndex(secondBrainRoot: string, options: LoadIndexOptions = {}): Manifest {
  const manifest = buildManifest(loadFragments(secondBrainRoot), {
    repoRoot: dirname(secondBrainRoot),
    now: options.now,
  });
  if (options.persist !== false) persistIndex(secondBrainRoot, manifest);
  return manifest;
}

// Read-through cache: reuse the persisted _manifest.json when it is at least as new as
// every fragment, otherwise rebuild in TypeScript (and persist unless disabled).
export function loadIndex(secondBrainRoot: string, options: LoadIndexOptions = {}): Manifest {
  const path = manifestPath(secondBrainRoot);
  if (!options.forceRebuild && existsSync(path)) {
    const newest = newestFragmentMtime(secondBrainRoot);
    if (newest !== null && statSync(path).mtimeMs >= newest) {
      const cached = tryReadManifest(path);
      if (cached) return cached;
    }
  }
  return rebuildIndex(secondBrainRoot, options);
}
