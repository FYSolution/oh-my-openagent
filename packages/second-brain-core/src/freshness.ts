import { computeAnchorHash } from "./anchor-hash";
import { DEFAULT_TRUST, FALLBACK_TTL_DAYS, TTL_DEFAULTS } from "./constants";
import { parseLocalDate } from "./date-parse";
import type { Frontmatter, FreshnessState, FreshnessStateName } from "./types";

const MS_PER_DAY = 86_400_000;

export interface FreshnessOptions {
  repoRoot: string;
  now?: Date;
}

function scalar(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function anchorList(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

// Port of Get-FreshnessState (compile-wiki.ps1 variant, with detailed drift strings).
export function freshnessOf(frontmatter: Frontmatter, options: FreshnessOptions): FreshnessState {
  const now = options.now ?? new Date();
  const type = scalar(frontmatter.type);
  const created = scalar(frontmatter.created);
  const lastVerified = scalar(frontmatter.last_verified);
  const ttlDays = scalar(frontmatter.ttl_days);
  const trust = scalar(frontmatter.trust) ?? DEFAULT_TRUST;

  const ttl = ttlDays ? Number(ttlDays) : type && type in TTL_DEFAULTS ? TTL_DEFAULTS[type] : FALLBACK_TTL_DAYS;

  const refStr = lastVerified ?? created ?? null;
  const refDate = refStr ? parseLocalDate(refStr) : null;
  const ageDays = refDate ? (now.getTime() - refDate.getTime()) / MS_PER_DAY : null;

  let drift: string | null = null;
  for (const rawAnchor of anchorList(frontmatter.code_anchors)) {
    const anchor = rawAnchor.trim();
    const at = anchor.indexOf("@");
    if (at === -1) continue;
    const spec = anchor.slice(0, at).trim();
    const stored = anchor.slice(at + 1).trim();
    const current = computeAnchorHash(options.repoRoot, spec);
    if (current === "MISSING") {
      drift = `missing: ${spec}`;
      break;
    }
    if (current === "RANGE") {
      drift = `range: ${spec}`;
      break;
    }
    if (current === "SPEC") {
      drift = `badspec: ${spec}`;
      break;
    }
    if (current !== stored) {
      drift = `mismatch: ${spec}`;
      break;
    }
  }

  let state: FreshnessStateName = "UNKNOWN";
  if (drift) {
    state = "DRIFTED";
  } else if (ageDays !== null) {
    if (ageDays <= ttl) state = "FRESH";
    else if (ageDays <= ttl * 3) state = "AGING";
    else state = "STALE";
  }

  return {
    state,
    drift,
    refDate: refStr,
    trust,
    ageDays: ageDays === null ? null : Math.round(ageDays * 10) / 10,
    ttl,
  };
}
