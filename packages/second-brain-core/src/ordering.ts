import type { EvaluatedFragment } from "./types";

// Newest-first by `created` (ISO-like strings sort lexicographically in chronological
// order), with relPath as a deterministic tie-break so ordering never depends on
// filesystem enumeration order.
export function byCreatedDesc(a: EvaluatedFragment, b: EvaluatedFragment): number {
  const ac = a.created ?? "";
  const bc = b.created ?? "";
  if (ac !== bc) return ac < bc ? 1 : -1;
  if (a.fragment.relPath < b.fragment.relPath) return -1;
  if (a.fragment.relPath > b.fragment.relPath) return 1;
  return 0;
}
