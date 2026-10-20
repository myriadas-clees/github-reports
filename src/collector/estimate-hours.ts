// Estimate hours from GitHub activity.
// Timestamp clustering alone undercounts real work between events (a 40k-line
// PR can look like minutes). We blend:
//   1) session hours from activity timestamps
//   2) volume hours from PR size / reviews / commits
// and take the stronger signal. Always labeled as an estimate.
// Persist HoursInputs on github-data.yaml so formula changes recompute without refetch.

export type HoursEstimateResult = {
  version: string;
  hours: number;
  sessions: number;
  sessionHours: number;
  /** Raw (uncompressed) volume hours from PR/review/commit activity. */
  volumeHours: number;
  /** Daily estimates only: volumeHours after diminishing returns (see compressDailyVolume). */
  compressedVolumeHours?: number;
  gapMinutes: number;
  maxSessionHours: number;
  note: string;
};

export type VolumeInput = {
  /** Authored PR delivery or reporting-user work performed on a PR in the window. */
  pullRequests?: {
    additions: number;
    deletions: number;
    state: string;
    dailyWork?: boolean;
    filesChanged?: number;
    testFilesChanged?: number;
    commitCount?: number;
  }[];
  reviewCount?: number;
  reviewCommentCount?: number;
  commitCount?: number;
  commitAdditions?: number;
  commitDeletions?: number;
  /** Direct commits that have line-stat enrichment. */
  commitStatsCount?: number;
  /**
   * Direct commits grouped into work units (see buildCommitUnits). When present,
   * each unit is estimated like a PR's daily work instead of lumping all commits
   * into a single churn band.
   */
  commitUnits?: CommitUnit[];
};

/** One scoped group of direct commits: the direct-push equivalent of a PR's daily work. */
export type CommitUnit = {
  additions: number;
  deletions: number;
  commitCount: number;
  /** Sum of per-commit file counts (upper bound on unique files) when known. */
  filesChanged?: number;
  testFilesChanged?: number;
  /** True when at least one commit in the unit has line stats. */
  hasStats?: boolean;
};

export type CommitUnitInput = {
  message: string;
  repo: string;
  additions?: number;
  deletions?: number;
  /** File paths when known. */
  files?: string[];
  /** File count when paths are unknown. */
  filesChanged?: number;
};

/** Snapshot of everything estimateHours needs — stored so formulas can change later. */
export type HoursInputs = {
  timestamps: string[];
  volume: VolumeInput;
  options: { gapMinutes: number; maxSessionHours: number; minimumHours?: number };
};

const DEFAULT_GAP_MINUTES = 90;
const DEFAULT_MAX_SESSION_HOURS = 6;
/** Minimum duration credited for a lone activity ping in a session (hours). */
const MIN_ACTIVITY_HOURS = 0.5;
export const ESTIMATOR_VERSION = "2.3";
const DAILY_PR_CONTEXT_HOURS = 1.5;
const FILE_BREADTH_HOURS = 0.2;
const MAX_FILE_BREADTH_HOURS = 1.5;
const TEST_CHANGE_HOURS = 0.75;
const ITERATION_HOURS = 0.5;
const MAX_ITERATION_HOURS = 1;

// Diminishing returns for very busy days. Summing PR/review hours linearly
// overstates equivalent effort on heavy days: work is partly parallel and
// AI-assisted, so the tenth PR of the day adds less than the first. Tiers are
// applied per day only (not to weekly sums), which keeps weekly totals believable.
export const DAILY_FULL_RATE_HOURS = 16;
export const DAILY_MID_RATE_HOURS = 40;
const DAILY_MID_RATE = 0.5;
const DAILY_HIGH_RATE = 0.25;

/** Rough effort bands from PR churn (additions + deletions). */
export const estimatePrHours = (additions: number, deletions: number): number => {
  const churn = Math.max(0, additions) + Math.max(0, deletions);
  if (churn < 50) return 0.75;
  if (churn < 150) return 1.5;
  if (churn < 400) return 2.5;
  if (churn < 1_000) return 4;
  if (churn < 2_500) return 6;
  if (churn < 6_000) return 9;
  if (churn < 15_000) return 13;
  if (churn < 30_000) return 18;
  return 22; // very large migrations / generated+hand edits
};

/** Estimate one day's attributable work on a PR from observable delivery signals. */
export const estimateDailyPrWorkHours = (pr: NonNullable<VolumeInput["pullRequests"]>[number]): number => {
  const churnHours = estimatePrHours(pr.additions, pr.deletions);
  const breadthHours = Math.min(
    Math.max(0, (pr.filesChanged ?? 0) - 1) * FILE_BREADTH_HOURS,
    MAX_FILE_BREADTH_HOURS,
  );
  const testHours = (pr.testFilesChanged ?? 0) > 0 ? TEST_CHANGE_HOURS : 0;
  const iterationHours = Math.min(
    Math.max(0, (pr.commitCount ?? 0) - 1) * ITERATION_HOURS,
    MAX_ITERATION_HOURS,
  );
  return round1(DAILY_PR_CONTEXT_HOURS + churnHours + breadthHours + testHours + iterationHours);
};

const round1 = (n: number): number => Math.round(n * 10) / 10;

const COMMIT_NO_STATS_HOURS = 0.5;
/** Cap for a unit with no line stats: context + the smallest churn band of a stats-based unit. */
const COMMIT_UNIT_NO_STATS_CAP_HOURS = DAILY_PR_CONTEXT_HOURS + 0.75;
const TEST_FILE_PATH_RE = /(^|\/)(__tests__|tests?)(\/|$)|\.(test|spec)\.[^/]+$/i;
const CONVENTIONAL_COMMIT_RE = /^\s*([a-z]+)(?:\(([^)]*)\))?!?:/i;

/** Unit key for a commit: conventional scope, else conventional type, else "misc". */
export const commitUnitKey = (message: string): string => {
  const match = CONVENTIONAL_COMMIT_RE.exec((message ?? "").split("\n")[0]);
  const scope = match?.[2]?.trim().toLowerCase();
  if (scope) return scope;
  const type = match?.[1]?.toLowerCase();
  return type || "misc";
};

/** Group commits into work-unit member index lists (same repo + same scope/type). */
export const groupCommitUnitIndexes = (commits: Pick<CommitUnitInput, "message" | "repo">[]): number[][] => {
  const groups = new Map<string, number[]>();
  commits.forEach((commit, index) => {
    const key = `${commit.repo}|${commitUnitKey(commit.message)}`;
    const members = groups.get(key);
    if (members) members.push(index);
    else groups.set(key, [index]);
  });
  return [...groups.values()];
};

/**
 * Group direct commits into work units by repo + conventional-commit scope
 * (fallback: conventional type, then "misc"). A scoped group of commits is the
 * direct-push equivalent of a PR's daily work, so `feat(pricing)` and
 * `fix(pricing)` in one repo are a single unit.
 */
export const buildCommitUnits = (commits: CommitUnitInput[]): CommitUnit[] =>
  groupCommitUnitIndexes(commits).map((members) => {
    let additions = 0;
    let deletions = 0;
    let files = 0;
    let filesKnown = false;
    let tests = 0;
    let hasStats = false;
    for (const index of members) {
      const commit = commits[index];
      if (commit.additions != null || commit.deletions != null) {
        hasStats = true;
        additions += commit.additions ?? 0;
        deletions += commit.deletions ?? 0;
      }
      if (commit.files) {
        filesKnown = true;
        files += commit.files.length;
        tests += commit.files.filter((file) => TEST_FILE_PATH_RE.test(file)).length;
      } else if (commit.filesChanged != null) {
        filesKnown = true;
        files += commit.filesChanged;
      }
    }
    return {
      additions,
      deletions,
      commitCount: members.length,
      hasStats,
      ...(filesKnown ? { filesChanged: files } : {}),
      ...(tests > 0 ? { testFilesChanged: tests } : {}),
    };
  });

/** Hours for one commit unit, using the same formula as a PR's daily work. */
export const estimateCommitUnitHours = (unit: CommitUnit): number => {
  const stats = unit.hasStats ?? true;
  if (!stats) return Math.min(unit.commitCount * COMMIT_NO_STATS_HOURS, COMMIT_UNIT_NO_STATS_CAP_HOURS);
  return estimateDailyPrWorkHours({
    additions: unit.additions,
    deletions: unit.deletions,
    state: "merged",
    dailyWork: true,
    filesChanged: unit.filesChanged,
    testFilesChanged: unit.testFilesChanged,
    commitCount: unit.commitCount,
  });
};

type CommitMessagesLike = {
  repo: string;
  messages: string[];
  commits?: { sha: string; message: string; additions?: number; deletions?: number; filesChanged?: number }[];
}[];

/** Direct commits (not already PR work commits) as unit inputs. */
export const collectDirectCommitInputs = (
  commitMessages: CommitMessagesLike,
  prWorkShas: Set<string>,
): CommitUnitInput[] =>
  commitMessages.flatMap((repo) =>
    repo.commits
      ? repo.commits
        .filter((commit) => !prWorkShas.has(commit.sha))
        .map((commit) => ({
          message: commit.message,
          repo: repo.repo,
          additions: commit.additions,
          deletions: commit.deletions,
          filesChanged: commit.filesChanged,
        }))
      : repo.messages.map((message) => ({ message, repo: repo.repo })),
  );

export const estimateSessionHours = (
  timestamps: string[],
  options: { gapMinutes?: number; maxSessionHours?: number } = {},
): { hours: number; sessions: number; gapMinutes: number; maxSessionHours: number } => {
  const gapMinutes = options.gapMinutes ?? DEFAULT_GAP_MINUTES;
  const maxSessionHours = options.maxSessionHours ?? DEFAULT_MAX_SESSION_HOURS;
  const gapMs = gapMinutes * 60_000;
  const maxSessionMs = maxSessionHours * 3_600_000;
  const minActivityMs = MIN_ACTIVITY_HOURS * 3_600_000;

  const sorted = [...new Set(timestamps)]
    .map((t) => new Date(t).getTime())
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);

  if (sorted.length === 0) {
    return { hours: 0, sessions: 0, gapMinutes, maxSessionHours };
  }

  let sessions = 0;
  let totalMs = 0;
  let sessionStart = sorted[0];
  let sessionEnd = sorted[0];

  const closeSession = (): void => {
    sessions += 1;
    const span = Math.max(sessionEnd - sessionStart, minActivityMs);
    totalMs += Math.min(span, maxSessionMs);
  };

  for (let i = 1; i < sorted.length; i++) {
    const t = sorted[i];
    if (t - sessionEnd > gapMs) {
      closeSession();
      sessionStart = t;
      sessionEnd = t;
    } else {
      sessionEnd = t;
    }
  }
  closeSession();

  return {
    hours: round1(totalMs / 3_600_000),
    sessions,
    gapMinutes,
    maxSessionHours,
  };
};

export const estimateVolumeHours = (input: VolumeInput = {}): number => {
  const prs = input.pullRequests ?? [];
  const prHours = prs.reduce(
    (sum, pr) => sum + (pr.dailyWork
      ? estimateDailyPrWorkHours(pr)
      : estimatePrHours(pr.additions, pr.deletions)),
    0,
  );
  // Reviews / comments are real collaboration time not captured by PR size.
  const reviewHours =
    (input.reviewCount ?? 0) * 0.75 + (input.reviewCommentCount ?? 0) * 0.25;
  const commitCount = input.commitCount ?? 0;
  const commitHours = input.commitUnits
    ? input.commitUnits.reduce((sum, unit) => sum + estimateCommitUnitHours(unit), 0)
    : (input.commitStatsCount ?? 0) > 0
    ? estimatePrHours(input.commitAdditions ?? 0, input.commitDeletions ?? 0)
    : commitCount * COMMIT_NO_STATS_HOURS;

  return round1(prHours + reviewHours + commitHours);
};

/**
 * Apply diminishing returns to one day's volume hours:
 * first 16h at 100%, 16–40h at 50%, above 40h at 25%.
 * e.g. 10 → 10, 30 → 23, 132.9 → 51.2. Negative/NaN → 0.
 */
export const compressDailyVolume = (hours: number): number => {
  if (!(hours > 0)) return 0;
  const full = Math.min(hours, DAILY_FULL_RATE_HOURS);
  const mid = Math.max(0, Math.min(hours, DAILY_MID_RATE_HOURS) - DAILY_FULL_RATE_HOURS);
  const high = Math.max(0, hours - DAILY_MID_RATE_HOURS);
  return round1(full + mid * DAILY_MID_RATE + high * DAILY_HIGH_RATE);
};

/**
 * Hybrid estimate: max(session clustering, volume from PR/review/commit activity).
 * Prefer volume when GitHub events are sparse relative to delivered change size.
 * Daily estimates (minimumHours > 0) compress volume with diminishing returns;
 * weekly estimates sum several days and are not compressed.
 */
export const estimateHours = (
  timestamps: string[],
  volume: VolumeInput = {},
  options: { gapMinutes?: number; maxSessionHours?: number; minimumHours?: number } = {},
): HoursEstimateResult => {
  const session = estimateSessionHours(timestamps, options);
  const volumeHours = estimateVolumeHours(volume);
  const isDaily = (options.minimumHours ?? 0) > 0;
  const compressedVolumeHours = isDaily ? compressDailyVolume(volumeHours) : undefined;
  const effectiveVolumeHours = compressedVolumeHours ?? volumeHours;
  const hours = round1(
    Math.max(options.minimumHours ?? 0, Math.max(session.hours, effectiveVolumeHours)),
  );

  const note =
    "Estimated work delivered: how long a typical engineer would need to build the same changes, " +
    "based on PR scope, reviews, and commits. Measures output, not hours worked. " +
    "Very busy days count with diminishing returns.";

  return {
    version: ESTIMATOR_VERSION,
    hours,
    sessions: session.sessions,
    sessionHours: session.hours,
    volumeHours,
    ...(compressedVolumeHours !== undefined ? { compressedVolumeHours } : {}),
    gapMinutes: session.gapMinutes,
    maxSessionHours: session.maxSessionHours,
    note,
  };
};

/** @deprecated Prefer estimateHours(); kept for older call sites/tests. */
export const estimateHoursFromTimestamps = (
  timestamps: string[],
  options: { gapMinutes?: number; maxSessionHours?: number } = {},
): HoursEstimateResult => estimateHours(timestamps, {}, options);

type HoursBearing = {
  hoursInputs?: HoursInputs;
  hoursEstimate?: {
    version?: string;
    hours: number;
    sessions: number;
    sessionHours?: number;
    volumeHours?: number;
    gapMinutes: number;
    maxSessionHours: number;
    note: string;
  };
  stats: { estimatedHours: number };
  pullRequests?: { workCommits?: { sha: string }[] }[];
  prsInProgress?: { workCommits?: { sha: string }[] }[];
  prsWorkedOnClosed?: { workCommits?: { sha: string }[] }[];
  commitMessages?: CommitMessagesLike;
};

/** Inject commitUnits derived from stored per-commit data, excluding PR work commits. */
const withCommitUnits = (data: HoursBearing, volume: VolumeInput): VolumeInput => {
  const hasCommitDetail = (data.commitMessages ?? []).some((repo) => (repo.commits?.length ?? 0) > 0);
  if (!hasCommitDetail) return volume;
  const prWorkShas = new Set(
    [...(data.pullRequests ?? []), ...(data.prsInProgress ?? []), ...(data.prsWorkedOnClosed ?? [])]
      .flatMap((pr) => (pr.workCommits ?? []).map((commit) => commit.sha)),
  );
  const inputs = collectDirectCommitInputs(data.commitMessages ?? [], prWorkShas);
  return { ...volume, commitUnits: buildCommitUnits(inputs) };
};

/** Re-run the current estimator from persisted hoursInputs (no GitHub calls). */
export const applyHoursEstimate = <T extends HoursBearing>(data: T): T => {
  if (!data.hoursInputs) return data;
  const hoursEstimate = estimateHours(
    data.hoursInputs.timestamps,
    withCommitUnits(data, data.hoursInputs.volume),
    data.hoursInputs.options,
  );
  return {
    ...data,
    hoursEstimate,
    stats: { ...data.stats, estimatedHours: hoursEstimate.hours },
  };
};
