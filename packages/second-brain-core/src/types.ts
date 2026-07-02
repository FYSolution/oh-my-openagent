export type FreshnessStateName = "FRESH" | "AGING" | "STALE" | "DRIFTED" | "UNKNOWN";

export interface Frontmatter {
  [key: string]: string | string[] | undefined;
}

export interface ParsedFragment {
  frontmatter: Frontmatter;
  body: string;
}

export interface Fragment extends ParsedFragment {
  filePath: string;
  relPath: string;
  fileName: string;
  user: string;
  mtimeMs: number;
}

export interface FreshnessState {
  state: FreshnessStateName;
  drift: string | null;
  refDate: string | null;
  trust: string;
  ageDays: number | null;
  ttl: number;
}

export interface EvaluatedFragment {
  fragment: Fragment;
  freshness: FreshnessState;
  type: string | undefined;
  target: string | undefined;
  section: string | null;
  author: string | null;
  created: string | null;
  action: string;
}

export interface ManifestFragmentRef {
  file: string;
  section: string | null;
  action: string;
  created: string | null;
  author: string | null;
}

export interface ManifestTargetFreshness {
  worst: FreshnessStateName;
  drifted: number;
  stale: number;
}

export interface ManifestTarget {
  type: string;
  fragmentCount: number;
  lastUpdated: string | null;
  authors: string[];
  hasConflicts: boolean;
  hasSynthesis: boolean;
  freshness: ManifestTargetFreshness;
  fragments: ManifestFragmentRef[];
}

export interface ManifestSimpleRef {
  file: string;
  section: string | null;
  created: string | null;
  author: string | null;
}

export interface NeedsVerificationEntry {
  file: string;
  target: string | null;
  type: string | null;
  state: FreshnessStateName;
  detail: string;
  refDate: string | null;
}

export interface Manifest {
  generated: string;
  totalFragments: number;
  targets: Record<string, ManifestTarget>;
  lessons: ManifestSimpleRef[];
  decisions: ManifestSimpleRef[];
  needsVerification: NeedsVerificationEntry[];
}

export interface SearchOptions {
  top?: number;
  folder?: string;
  now?: Date;
}

export interface SearchResult {
  path: string;
  score: number;
  lineNum: number;
  line: string;
  tags: string;
  state: FreshnessStateName;
}
