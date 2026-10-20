// Per-PR readiness / complexity / checks indicators for stakeholders.
// Derived at render time from data/evidence.yaml; every function degrades gracefully when it is missing.

import { TEST_FILE_RE } from "./allocation.js";
import type {
  Allocation,
  AllocationItem,
  Complexity,
  DeploymentRecord,
  EvidenceLedger,
  PrChecks,
  PrEvidence,
  Readiness,
} from "../types.js";

export type ReadinessItem = Pick<AllocationItem, "state" | "title" | "labels" | "url" | "repository">;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Format an instant as a calendar date in the report timezone. */
const calendarDate = (iso: string, timeZone: string): string => {
  // A bare calendar date has no instant to convert (new Date() would read it as UTC midnight).
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso.slice(0, 10);
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  } catch {
    // Invalid IANA zone in config: fall back to UTC rather than failing the render.
    return date.toISOString().slice(0, 10);
  }
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((x) => x.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

/** "Oct 8" from an ISO timestamp / date in the report timezone. */
const formatDay = (iso: string, timeZone: string): string => {
  const day = calendarDate(iso, timeZone);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return iso;
  const month = Number(m[2]);
  return `${MONTHS[month - 1] ?? m[2]} ${Number(m[3])}`;
};

const ms = (iso: string | null | undefined): number => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : NaN;
};

const LABEL_STAGE_RE = /^(?:stage|readiness)\s*:\s*(prototype|beta|pilot|production|live)$/i;
const PROTOTYPE_TITLE_RE = /\b(wip|prototype|poc|proof of concept|spike|experiment(?:al)?|draft)\b/i;

const labelOverride = (labels: string[] | undefined): Readiness | undefined => {
  for (const label of labels ?? []) {
    const m = LABEL_STAGE_RE.exec(label.trim());
    if (!m) continue;
    const x = m[1]!.toLowerCase();
    if (x === "prototype") return { stage: "prototype", label: "Prototype", detail: "Exploratory, not production-ready" };
    if (x === "beta" || x === "pilot") return { stage: "preview", label: "Pilot", detail: "Limited release, not fully rolled out" };
    return { stage: "live", label: "Live", detail: "Marked as live" };
  }
  return undefined;
};

const earliest = (deps: DeploymentRecord[]): DeploymentRecord | undefined =>
  [...deps].sort((a, b) => ms(a.succeededAt) - ms(b.succeededAt))[0];

/** Deployment currently supporting a merged PR's live/preview readiness. */
export const matchedReleaseDeployment = (item: ReadinessItem, evidence: EvidenceLedger): { stage: "live" | "preview"; deployment: DeploymentRecord } | undefined => {
  const pe = item.url ? evidence.prs?.[item.url] : undefined;
  if (!pe || item.state !== "merged") return undefined;
  const repo = item.repository ?? pe.repository ?? "";
  const deps = evidence.deployments?.[repo] ?? [];
  const targetRef = pe.baseRef || evidence.defaultBranches?.[repo] || "main";
  const mergedMs = ms(pe.mergedAt);
  const isMergeCommitDeployment = (d: DeploymentRecord): boolean =>
    !!pe.mergeCommitSha && (d.sha === pe.mergeCommitSha || d.ref === pe.mergeCommitSha);
  const isContainingDeployment = (d: DeploymentRecord): boolean =>
    !!pe.containingDeployments?.some((entry) => entry.environment === d.environment && entry.sha === d.sha);
  const after = (d: DeploymentRecord): boolean =>
    (Number.isFinite(mergedMs) && ms(d.createdAt) >= mergedMs) || isMergeCommitDeployment(d);
  const live = earliest(deps.filter((d) => d.production && (d.ref === targetRef || isMergeCommitDeployment(d) || isContainingDeployment(d)) && after(d)));
  if (live) return { stage: "live", deployment: live };
  const preview = earliest(deps.filter((d) => !d.production && (d.ref === targetRef || d.ref === pe.headRef || isMergeCommitDeployment(d) || isContainingDeployment(d)) && after(d)));
  return preview ? { stage: "preview", deployment: preview } : undefined;
};

/** Readiness of a PR item; undefined for non-PR items. */
export const deriveReadiness = (item: ReadinessItem, evidence: EvidenceLedger | null, timeZone = "UTC"): Readiness | undefined => {
  if (item.state !== "open" && item.state !== "merged") return undefined;
  const override = labelOverride(item.labels);
  if (override) return override;
  const pe: PrEvidence | undefined = item.url ? evidence?.prs?.[item.url] : undefined;

  if (item.state === "open") {
    if (pe?.isDraft) return { stage: "draft", label: "Draft", detail: "Early version, not ready for review" };
    if (PROTOTYPE_TITLE_RE.test(item.title) || /^\s*\[wip\]/i.test(item.title)) {
      return { stage: "prototype", label: "Prototype", detail: "Exploratory, not production-ready" };
    }
    return { stage: "in-review", label: "In review", detail: "Being reviewed, not merged yet" };
  }

  if (pe?.release?.stage === "live") {
    return { stage: "live", label: "Live", detail: `Live since ${formatDay(pe.release.since, timeZone)}`, since: calendarDate(pe.release.since, timeZone) };
  }

  // merged
  if (!evidence) return { stage: "done", label: "Done", detail: "Merged" };
  const repo = item.repository ?? pe?.repository ?? "";
  const deps = evidence.deployments?.[repo] ?? [];
  const defaultBranch = evidence.defaultBranches?.[repo] ?? "main";
  const mergedAt = pe?.mergedAt ?? null;
  const mergedDay = mergedAt ? formatDay(mergedAt, timeZone) : undefined;
  const mergedSince = mergedAt ? calendarDate(mergedAt, timeZone) : undefined;
  const mergedText = mergedDay ? `Merged ${mergedDay}` : "Merged";

  const isMergeCommitDeployment = (d: DeploymentRecord): boolean =>
    !!pe?.mergeCommitSha && (d.sha === pe.mergeCommitSha || d.ref === pe.mergeCommitSha);
  const isContainingDeployment = (d: DeploymentRecord): boolean =>
    !!pe?.containingDeployments?.some((entry) => entry.environment === d.environment && entry.sha === d.sha);

  // When the latest deployment refresh failed, known deployments still count, but the
  // absence of a match is unknown rather than "not live yet" / "not tracked".
  const ancestryUnknown = typeof pe?.ancestryUnknown === "boolean"
    ? pe.ancestryUnknown
    : Boolean(pe?.ancestryUnknown?.production || pe?.ancestryUnknown?.nonProduction);
  const productionUnknown = typeof pe?.ancestryUnknown === "boolean" ? pe.ancestryUnknown : Boolean(pe?.ancestryUnknown?.production);
  const unavailable = Boolean(evidence.deploymentsUnavailable?.[repo]) || ancestryUnknown;
  const notCollected = { stage: "done" as const, label: "Done", detail: `${mergedText}; release status not collected`, ...(mergedSince ? { since: mergedSince } : {}) };

  if (!unavailable && pe?.baseRef && pe.baseRef !== defaultBranch && !deps.some((d) => d.ref === pe.baseRef || isMergeCommitDeployment(d) || isContainingDeployment(d))) {
    return {
      stage: "awaiting-release",
      label: "Done · not live yet",
      detail: `Merged into a larger change (${pe.baseRef}) that isn't live yet`,
      ...(mergedSince ? { since: mergedSince } : {}),
    };
  }
  if (!pe) return { stage: "done", label: "Done", detail: "Merged; release status not collected" };

  const matched = matchedReleaseDeployment(item, evidence);
  if (matched?.stage === "live") {
    const live = matched.deployment;
    return { stage: "live", label: "Live", detail: `Live since ${formatDay(live.succeededAt, timeZone)}`, since: calendarDate(live.succeededAt, timeZone) };
  }
  if (matched?.stage === "preview" || pe.release?.stage === "preview") {
    const preview = matched?.stage === "preview" ? matched.deployment : undefined;
    const since = preview?.succeededAt ?? pe.release!.since;
    return {
      stage: "preview",
      label: "In testing",
      detail: `On the preview site since ${formatDay(since, timeZone)}${(productionUnknown || evidence.deploymentsUnavailable?.[repo]) ? "; production release status not collected" : ""}`,
      since: calendarDate(since, timeZone),
    };
  }
  if (unavailable) return notCollected;
  if (deps.some((d) => d.production)) {
    return {
      stage: "awaiting-release",
      label: "Done · not live yet",
      detail: `${mergedText}; not deployed to production yet`,
      ...(mergedSince ? { since: mergedSince } : {}),
    };
  }
  return { stage: "done", label: "Done", detail: `${mergedText}; release not tracked for this repo` };
};

// ---------------------------------------------------------------- complexity

const IGNORED_RE = /(^|\/)(bun\.lockb?|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|[^/]+\.lock)$|(^|\/)(dist|build|vendor|node_modules|__generated__)\//i;
const GENERATED_RE = /\.min\.[^/]+$|\.snap$|\.generated\.[^/]+$|(^|\/)__generated__(\/|$)/i;
const CONTAINER_DIRS = new Set(["apps", "packages", "services", "libs", "modules", "src", "functions", "api", "infra"]);
/** Shared-code containers: an area inside them is reported as "<name> (shared)". */
const SHARED_DIRS = new Set(["packages", "libs", "modules"]);
/** Supporting files: real work, but they don't widen the set of systems a change touches. */
const SUPPORT_RE = /\.(md|mdx|txt)$|(^|\/)(docs?|\.github|\.agents|\.vscode|scripts|research|templates)\//i;
/** Root files that describe or configure the project rather than implement it. */
const ROOT_SUPPORT_RE = /^(?:package\.json|tsconfig[^/]*\.json|[^/]+\.config\.(?:js|ts|mjs|cjs)|\.eslintrc[^/]*|\.prettierrc[^/]*|\.editorconfig|\.git(?:ignore|attributes|modules)|\.npmrc|\.nvmrc|Dockerfile|docker-compose[^/]*|Makefile|go\.(?:mod|sum)|Cargo\.toml|pyproject\.toml|requirements[^/]*\.txt|setup\.cfg|[^/]+\.(?:md|mdx|txt)|LICENSE[^/]*|[^/.]+\.lock)$/i;
const ROOT_SOURCE_RE = /\.(?:tsx?|jsx?|mjs|cjs|html?|css|scss|sass|less|styl|astro|py|go|rb|rs|java|kt|swift|cs|php|c|cc|cpp|h|hpp|scala|ex|exs|sql|vue|svelte)$/i;
/** A risk tag needs at least this share of the relevant files, so one incidental file doesn't flag a change. */
const RISK_MIN_SHARE = 0.2;

const RISK_RULES: { re: RegExp; label: string; codeOnly: boolean }[] = [
  { re: /(^|[/._-])(auth|authn|authz|login|logout|sso|oauth|permissions?|rbac|roles?|claims?)([/._-]|$)/i, label: "Sign-in & permissions", codeOnly: true },
  { re: /(^|[/._-])(billing|payments?|stripe|invoices?|checkout)([/._-]|$)/i, label: "Payments", codeOnly: true },
  { re: /(^|[/._-])(migrations?|schema)([/._-]|$)|\.sql$|prisma\//i, label: "Data changes", codeOnly: true },
  { re: /\.github\/workflows\/|(^|\/)(terraform|bicep|infra)\/|\.(tf|bicep)$/i, label: "Infrastructure", codeOnly: false },
];

const areaOf = (file: string, systems: Record<string, string> | undefined): string => {
  if (systems) {
    const match = Object.keys(systems)
      .filter((prefix) => {
        const p = prefix.replace(/\/+$/, "");
        return p && (file === p || file.startsWith(`${p}/`));
      })
      .sort((a, b) => b.length - a.length)[0];
    if (match) return systems[match]!;
  }
  const parts = file.split("/");
  if (parts.length === 1) return "project root";
  if (CONTAINER_DIRS.has(parts[0]!) && parts.length > 2) {
    return SHARED_DIRS.has(parts[0]!) ? `${parts[1]!} (shared)` : parts[1]!;
  }
  return parts[0]!;
};

const LEVELS: Record<Complexity["level"], string> = {
  contained: "Contained",
  connected: "Connected",
  "cross-system": "Cross-system",
};

const meetsShare = (matches: number, total: number): boolean =>
  matches > 0 && total > 0 && matches >= Math.max(1, Math.ceil(total * RISK_MIN_SHARE));

/**
 * How broad a change is, from the files it touches. Undefined when no files are known.
 * Areas come from product code only; tests, docs, CI and tooling are supporting files.
 */
export const deriveComplexity = (files: string[], systems?: Record<string, string>): Complexity | undefined => {
  const relevant = files.filter((f) => f && !IGNORED_RE.test(f) && !GENERATED_RE.test(f));
  if (relevant.length === 0) return undefined;
  const code = relevant.filter((f) =>
    !TEST_FILE_RE.test(f) && !SUPPORT_RE.test(f) &&
    // Root files count as code only with a source extension (and not a known config file
    // like vite.config.ts); other root dotfiles/metadata (.prettierignore, renovate.json) are support.
    (f.includes("/") || (ROOT_SOURCE_RE.test(f) && !ROOT_SUPPORT_RE.test(f))),
  );
  const risks = RISK_RULES.filter(({ re, codeOnly }) => {
    const pool = codeOnly ? code : relevant;
    return meetsShare(pool.filter((f) => re.test(f)).length, pool.length);
  }).map(({ label }) => label);
  if (code.length === 0) {
    return { level: "contained", label: LEVELS.contained, reason: "Docs, tests or tooling only", risks };
  }
  const counts = new Map<string, number>();
  for (const f of code) {
    const area = areaOf(f, systems);
    counts.set(area, (counts.get(area) ?? 0) + 1);
  }
  const areas = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([area]) => area);
  const level: Complexity["level"] = areas.length === 1 ? "contained" : areas.length <= 3 ? "connected" : "cross-system";
  const shown = areas.slice(0, 4).join(", ");
  const more = areas.length > 4 ? ` +${areas.length - 4} more` : "";
  return {
    level,
    label: LEVELS[level],
    reason: `Touches ${areas.length} ${areas.length === 1 ? "area" : "areas"}: ${shown}${more}`,
    risks,
  };
};

// ---------------------------------------------------------------- checks

export const derivePrChecks = (
  item: Pick<AllocationItem, "url">,
  evidence: EvidenceLedger | null,
  files: string[],
): PrChecks => {
  const pe = item.url ? evidence?.prs?.[item.url] : undefined;
  const reviews = pe?.reviews ?? [];
  const unique = (bot: boolean): number => new Set(reviews.filter((r) => !!r.bot === bot).map((r) => r.reviewer)).size;
  const c = pe?.checks;
  return {
    automated: c ? { passed: c.passed, failed: c.failed, pending: c.pending ?? 0, total: c.passed + c.failed + (c.pending ?? 0), ...(c.statusesUnavailable || c.checkRunsUnavailable ? { partial: true } : {}) } : null,
    humanReviews: unique(false),
    automatedReviews: unique(true),
    testsUpdated: files.some((f) => TEST_FILE_RE.test(f)),
  };
};

/** Names of the checks that ran on a PR (for display), if collected. */
export const checkNames = (item: Pick<AllocationItem, "url">, evidence: EvidenceLedger | null): string[] =>
  (item.url ? evidence?.prs?.[item.url]?.checks?.names : undefined) ?? [];

// ---------------------------------------------------------------- annotate / summarize

/** PR item carrying the names of the checks that ran (render-time only, not part of the shared type). */
export type AnnotatedItem = AllocationItem & { checkNames?: string[] };

/** Deep copy of an allocation with readiness / complexity / checks on every PR item. */
export const annotateAllocation = (
  allocation: Allocation,
  evidence: EvidenceLedger | null,
  systems?: Record<string, string>,
  timeZone = "UTC",
): Allocation => {
  const copy = structuredClone(allocation);
  for (const bucket of copy.initiatives) {
    for (const section of ["shipped", "inProgress", "other"] as const) {
      for (const item of bucket[section]) {
        if (item.kind !== "pr") continue;
        const evFiles = item.url ? evidence?.prs?.[item.url]?.files : undefined;
        const files = evFiles && evFiles.length > 0 ? evFiles : item.files ?? [];
        const readiness = deriveReadiness(item, evidence, timeZone);
        const complexity = deriveComplexity(files, systems);
        if (readiness) item.readiness = readiness;
        if (complexity) item.complexity = complexity;
        item.checks = derivePrChecks(item, evidence, files);
        const names = checkNames(item, evidence);
        if (names.length > 0) (item as AnnotatedItem).checkNames = names;
      }
    }
  }
  return copy;
};

export type VerificationSummary = {
  completed: number;
  live: number;
  awaitingRelease: number;
  preview: number;
  inReview: number;
  drafts: number;
  withoutChecks: number;
  checksUnknown: number;
  withPassingChecks: number;
  withPartialChecks: number;
  withPendingChecks: number;
  checksCollected: number;
  withAutomatedReview: number;
  withHumanReview: number;
  withTests: number;
  aiFindingsAddressed: number;
};

/** Period-level counts over unique PR items (shipped + in progress). */
export const summarizeVerification = (allocation: Allocation): VerificationSummary => {
  const s: VerificationSummary = {
    completed: 0, live: 0, awaitingRelease: 0, preview: 0, inReview: 0, drafts: 0,
    withoutChecks: 0, checksUnknown: 0, withPassingChecks: 0, withPartialChecks: 0, withPendingChecks: 0, checksCollected: 0, withAutomatedReview: 0, withHumanReview: 0, withTests: 0,
    aiFindingsAddressed: allocation.aiFindingsAddressed ?? 0,
  };
  const seen = new Set<string>();
  for (const bucket of allocation.initiatives) {
    // Closed, unmerged PRs sit in `other` and are neither completed nor in review, so they are
    // left out of every count (readiness and checks alike) to keep the lines consistent.
    for (const item of [...(bucket.shipped ?? []), ...(bucket.inProgress ?? [])]) {
      if (item.kind !== "pr") continue;
      const key = item.url ?? `${item.repository}|${item.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const stage = item.readiness?.stage;
      if (stage === "draft" || stage === "prototype") {
        s.drafts += 1;
      } else if (item.state === "merged") {
        s.completed += 1;
        if (stage === "live") s.live += 1;
        else if (stage === "awaiting-release") s.awaitingRelease += 1;
        else if (stage === "preview") s.preview += 1;
      } else {
        s.inReview += 1;
      }
      const c = item.checks;
      if (!c?.automated) {
        s.checksUnknown += 1;
      } else if (c.automated.total > 0) {
        s.checksCollected += 1;
        if (c.automated.pending > 0) s.withPendingChecks += 1;
        if (c.automated.partial) s.withPartialChecks += 1;
        else if (c.automated.failed === 0 && c.automated.pending === 0) s.withPassingChecks += 1;
      } else {
        s.withoutChecks += 1;
      }
      // Review and test evidence is independent of whether check runs were collected.
      if (c && c.automatedReviews > 0) s.withAutomatedReview += 1;
      if (c && c.humanReviews > 0) s.withHumanReview += 1;
      if (c?.testsUpdated) s.withTests += 1;
    }
  }
  return s;
};
