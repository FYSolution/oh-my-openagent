import type { FreshnessStateName } from "./types";

export const TTL_DEFAULTS: Record<string, number> = {
  lesson: 180,
  decision: 365,
  entity: 30,
  concept: 90,
  source: 14,
  analysis: 60,
  overview: 120,
  synthesis: 60,
};

export const FALLBACK_TTL_DAYS = 60;
export const DEFAULT_TRUST = "curated";

export const TYPE_TO_FOLDER: Record<string, string> = {
  entity: "entities",
  concept: "concepts",
  source: "sources",
  analysis: "analysis",
  overview: "",
  synthesis: "entities",
};

export function defaultActionForType(type: string | undefined): string {
  switch (type) {
    case "lesson":
    case "decision":
    case "analysis":
      return "append";
    default:
      return "replace";
  }
}

export function stateRank(state: FreshnessStateName): number {
  switch (state) {
    case "DRIFTED":
      return 4;
    case "STALE":
      return 3;
    case "UNKNOWN":
      return 2;
    case "AGING":
      return 1;
    case "FRESH":
      return 0;
    default:
      return 2;
  }
}

export function freshnessFactor(state: FreshnessStateName): number {
  switch (state) {
    case "FRESH":
      return 1.0;
    case "AGING":
      return 0.85;
    case "UNKNOWN":
      return 0.8;
    case "STALE":
      return 0.6;
    case "DRIFTED":
      return 0.3;
    default:
      return 0.8;
  }
}

export function trustFactor(trust: string): number {
  switch (trust) {
    case "verified":
      return 1.2;
    case "curated":
      return 1.0;
    case "source":
      return 0.9;
    case "untrusted":
      return 0.3;
    default:
      return 1.0;
  }
}

export function stateBadge(state: string): string {
  switch (state) {
    case "FRESH":
      return "fresh";
    case "AGING":
      return "aging";
    case "STALE":
      return "stale";
    case "DRIFTED":
      return "drifted";
    default:
      return "unknown";
  }
}

export function titleCase(slug: string): string {
  return slug.replace(/-/g, " ").replace(/(^| )([a-z0-9])/g, (m) => m.toUpperCase());
}
