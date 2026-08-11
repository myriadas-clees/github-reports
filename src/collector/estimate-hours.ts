// Estimate hours from GitHub activity.
// Timestamp clustering alone undercounts real work between events (a 40k-line
// PR can look like minutes). We blend:
//   1) session hours from activity timestamps
//   2) volume hours from PR size / reviews / commits
// and take the stronger signal. Always labeled as an estimate.

export type HoursEstimateResult = {
  version: string;
  hours: number;
  sessions: number;
  sessionHours: number;
  volumeHours: number;
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
};

const DEFAULT_GAP_MINUTES = 90;
const DEFAULT_MAX_SESSION_HOURS = 6;
/** Minimum duration credited for a lone activity ping in a session (hours). */
const MIN_ACTIVITY_HOURS = 0.5;
export const ESTIMATOR_VERSION = "2.0";
const DAILY_PR_CONTEXT_HOURS = 1.5;
const FILE_BREADTH_HOURS = 0.2;
const MAX_FILE_BREADTH_HOURS = 1.5;
const TEST_CHANGE_HOURS = 0.75;
const ITERATION_HOURS = 0.5;
const MAX_ITERATION_HOURS = 1;

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
  // Commits without a matching PR still imply work; keep this light to avoid double-counting.
  const commitHours = Math.min((input.commitCount ?? 0) * 0.2, 8);

  return round1(prHours + reviewHours + commitHours);
};

/**
 * Hybrid estimate: max(session clustering, volume from PR/review/commit activity).
 * Prefer volume when GitHub events are sparse relative to delivered change size.
 */
export const estimateHours = (
  timestamps: string[],
  volume: VolumeInput = {},
  options: { gapMinutes?: number; maxSessionHours?: number } = {},
): HoursEstimateResult => {
  const session = estimateSessionHours(timestamps, options);
  const volumeHours = estimateVolumeHours(volume);
  const hours = round1(Math.max(session.hours, volumeHours));

  const note =
    "Estimated conventional engineering effort based on delivered PR scope, " +
    "reviews, commits, and GitHub activity. Not tracked, elapsed, or billed time.";

  return {
    version: ESTIMATOR_VERSION,
    hours,
    sessions: session.sessions,
    sessionHours: session.hours,
    volumeHours,
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
