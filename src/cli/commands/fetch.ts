// fetch commands: daily-fetch (events) and weekly-fetch (full data)

import { Command } from "commander";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml, stringify as toYaml } from "yaml";
import { graphql } from "@octokit/graphql";
import { buildDayRange, buildPreviousWorkdayRange, buildWeeklyRange, toISODate, parseLocalDate, type DateRange } from "../../collector/date-range.js";
import { fetchEvents, dedupeEvents } from "../../collector/fetch-events.js";
import { fetchContributions } from "../../collector/fetch-contributions.js";
import { fetchPRsByRefs, type PRRef } from "../../collector/fetch-repo-prs.js";
import { fetchCommitMessages } from "../../collector/fetch-commits.js";
import { fetchReleases } from "../../collector/fetch-releases.js";
import { fetchReviewsForRepos } from "../../collector/fetch-reviews.js";
import { aggregateRepositories } from "../../collector/aggregate.js";
import { estimateHours } from "../../collector/estimate-hours.js";
import { buildStakeholderSummary } from "../../collector/stakeholder-summary.js";
import { getWeekId } from "../../deployer/week.js";
import { getDayId, getPreviousDayId } from "../../deployer/day.js";
import { loadConfigFile, resolveConfig } from "../../config.js";
import type { GitHubEvent, WeeklyReportData } from "../../types.js";

const env = (key: string): string | undefined => process.env[key];

export type BaseOptions = {
  token: string;
  username: string;
  dataDir: string;
  timezone: string;
  date?: Date;
  repositories: string[];
  sessionGapMinutes: number;
  maxSessionHours: number;
};

export const resolveBaseOptions = async (
  cli: Record<string, string | undefined>,
): Promise<BaseOptions> => {
  const configPath = cli.config ?? env("CONFIG_PATH") ?? "./config.yaml";
  const fileCfg = await loadConfigFile(configPath);
  const cfg = resolveConfig(fileCfg, cli);

  const token = cli.token ?? env("GITHUB_TOKEN") ?? env("GH_PAT");
  if (!token) throw new Error("GitHub token required. Pass --token or set GITHUB_TOKEN / GH_PAT.");
  if (!cfg.username) throw new Error("GitHub username required. Pass --username, set GITHUB_USERNAME, or set username in config.yaml.");

  const date = cli.date ? parseLocalDate(cli.date, cfg.timezone) : undefined;
  return {
    token,
    username: cfg.username,
    dataDir: cfg.dataDir,
    date,
    timezone: cfg.timezone,
    repositories: cfg.repositories,
    sessionGapMinutes: cfg.sessionGapMinutes,
    maxSessionHours: cfg.maxSessionHours,
  };
};

const tryReadYaml = async <T>(path: string): Promise<T | null> => {
  try {
    const raw = await readFile(path, "utf-8");
    return parseYaml(raw) as T;
  } catch {
    return null;
  }
};

export const extractPRRefs = (events: GitHubEvent[]): PRRef[] => {
  const refs: PRRef[] = [];
  events.forEach((e) => {
    const p = e.payload;
    if (p.kind === "pull_request" && p.number > 0) {
      refs.push({ repo: e.repo, number: p.number });
    }
    if (p.kind === "review" && p.prNumber > 0) {
      refs.push({ repo: e.repo, number: p.prNumber });
    }
  });
  return refs;
};

export const filterEventsToRepositories = (
  events: GitHubEvent[],
  repositories: string[],
): GitHubEvent[] => {
  if (repositories.length === 0) return events;
  const allowed = new Set(repositories.map((repo) => repo.toLowerCase()));
  return events.filter((event) => allowed.has(event.repo.toLowerCase()));
};

export type FetchPlan = {
  targetDate: string;
  rangeFrom: string;
  rangeTo: string;
  weekPath: string;
  reportDir: string;
  range: DateRange;
};

export const buildDailyPlan = (now: Date, timezone: string, dataDir: string): FetchPlan => {
  const dayId = getPreviousDayId(now, timezone);
  const range = buildPreviousWorkdayRange(now, timezone);
  return {
    targetDate: dayId.date,
    rangeFrom: toISODate(range.from, timezone),
    rangeTo: toISODate(range.to, timezone),
    weekPath: dayId.path,
    reportDir: join(dataDir, dayId.path),
    range,
  };
};

const buildExactDayPlan = (date: Date, timezone: string, dataDir: string): FetchPlan => {
  const dayId = getDayId(date, timezone);
  const range = buildDayRange(date, timezone);
  return {
    targetDate: dayId.date,
    rangeFrom: dayId.date,
    rangeTo: dayId.date,
    weekPath: dayId.path,
    reportDir: join(dataDir, dayId.path),
    range,
  };
};

export const buildWeeklyPlan = (now: Date, timezone: string, dataDir: string): FetchPlan => {
  const weekId = getWeekId(now, timezone);
  const range = buildWeeklyRange(now, timezone);
  return {
    targetDate: toISODate(now, timezone),
    rangeFrom: toISODate(range.from, timezone),
    rangeTo: toISODate(range.to, timezone),
    weekPath: weekId.path,
    reportDir: join(dataDir, weekId.path),
    range,
  };
};

const logPlan = (command: string, username: string, timezone: string, plan: FetchPlan): void => {
  console.log(`${command}: user=${username} timezone=${timezone}`);
  console.log(`  target date : ${plan.targetDate}`);
  console.log(`  date range  : ${plan.rangeFrom} .. ${plan.rangeTo}`);
  console.log(`  archive     : ${plan.weekPath}`);
  console.log(`  data dir    : ${plan.reportDir}`);
};

/** Search PRs (public + private the token can see). Optionally scope to configured repos. */
const searchWeeklyPRs = async (
  token: string,
  username: string,
  range: DateRange,
  repositories: string[],
): Promise<PRRef[]> => {
  const from = range.from.toISOString().split("T")[0];
  const to = range.to.toISOString().split("T")[0];
  const refs: PRRef[] = [];

  const repoClauses =
    repositories.length > 0
      ? repositories.map((r) => `repo:${r}`)
      : [""];

  for (const repoClause of repoClauses) {
    for (const qualifier of [`author:${username}`, `reviewed-by:${username}`, `commenter:${username}`]) {
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const parts = [`is:pr`, qualifier, `updated:${from}..${to}`];
        if (repoClause) parts.push(repoClause);
        const q = encodeURIComponent(parts.join(" "));
        const url = `https://api.github.com/search/issues?q=${q}&per_page=100&page=${page}`;
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "worklog",
          },
        });
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            throw new Error(
              `GitHub Search API returned ${res.status}. Check that your token (GH_PAT) is valid and has repo access.`,
            );
          }
          console.warn(`  Search API error (${res.status}), some PRs may be missing.`);
          break;
        }
        const data = (await res.json()) as {
          items: { number: number; pull_request?: { url: string }; repository_url: string }[];
          total_count: number;
        };
        data.items
          .filter((item) => item.pull_request)
          .forEach((item) => {
            const repo = item.repository_url.replace("https://api.github.com/repos/", "");
            refs.push({ repo, number: item.number });
          });
        hasMore = data.items.length === 100;
        page++;
      }
    }
  }
  return refs;
};

const collectTimestamps = (
  events: GitHubEvent[],
  commitMessages: Awaited<ReturnType<typeof fetchCommitMessages>>,
  pullRequests: Awaited<ReturnType<typeof fetchPRsByRefs>>,
  reviews: Awaited<ReturnType<typeof fetchReviewsForRepos>>,
): string[] => {
  const stamps: string[] = [];
  events.forEach((e) => stamps.push(e.createdAt));
  commitMessages.forEach((cm) => {
    cm.commits?.forEach((c) => {
      if (c.authoredAt) stamps.push(c.authoredAt);
    });
  });
  pullRequests.forEach((pr) => {
    stamps.push(pr.createdAt);
    if (pr.mergedAt) stamps.push(pr.mergedAt);
  });
  reviews.reviews.forEach((r) => {
    if (r.submittedAt) stamps.push(r.submittedAt);
  });
  reviews.comments.forEach((c) => stamps.push(c.createdAt));
  return stamps;
};

const runFullFetch = async (
  options: BaseOptions,
  plan: FetchPlan,
  command: "daily-fetch" | "weekly-fetch",
): Promise<void> => {
  await mkdir(plan.reportDir, { recursive: true });

  logPlan(command, options.username, options.timezone, plan);
  if (options.repositories.length > 0) {
    console.log(`  configured repos: ${options.repositories.join(", ")}`);
  }

  const eventsPath = join(plan.reportDir, "events.yaml");
  let events = filterEventsToRepositories(
    await tryReadYaml<GitHubEvent[]>(eventsPath) ?? [],
    options.repositories,
  );

  console.log("Fetching events for the report window...");
  const reportEvents = await fetchEvents(options.token, options.username, plan.range, {
    includePrivate: true,
    repos: options.repositories.length > 0 ? options.repositories : undefined,
  });
  events = filterEventsToRepositories(
    dedupeEvents([...events, ...reportEvents]),
    options.repositories,
  );
  await writeFile(eventsPath, toYaml(events, { lineWidth: 120 }), "utf-8");
  console.log(`Loaded ${events.length} events.`);

  const eventRefs = extractPRRefs(events);
  console.log(`Found ${eventRefs.length} PR references from events.`);

  console.log("Searching for PRs updated in the report window (includes private repos the token can access)...");
  const searchRefs = await searchWeeklyPRs(
    options.token,
    options.username,
    plan.range,
    options.repositories,
  );
  console.log(`Found ${searchRefs.length} PR references from search.`);

  const allRefs = [...eventRefs, ...searchRefs];
  const uniqueRefs = new Map<string, PRRef>();
  allRefs.forEach((ref) => uniqueRefs.set(`${ref.repo}#${ref.number}`, ref));
  console.log(`Total unique PRs: ${uniqueRefs.size}`);

  console.log("Fetching PRs...");
  const pullRequests = await fetchPRsByRefs(options.token, [...uniqueRefs.values()]);
  console.log(`Fetched ${pullRequests.length} PRs.`);

  const authored = pullRequests.filter(
    (pr) => pr.author.toLowerCase() === options.username.toLowerCase(),
  );
  const prsOpened = authored.length;
  const prsMerged = authored.filter((pr) => pr.state === "merged").length;
  const prsInProgress = authored.filter((pr) => pr.state === "open");

  console.log("Fetching contribution stats...");
  const gql = graphql.defaults({ headers: { authorization: `token ${options.token}` } });
  const contributions = await fetchContributions(gql, options.username, plan.range, options.timezone);

  // Repos to enrich: configured + discovered
  const discoveredRepos = new Set<string>([
    ...options.repositories,
    ...pullRequests.map((pr) => pr.repository),
    ...events.map((e) => e.repo),
  ]);
  const repoNames = [...discoveredRepos];

  console.log(`Fetching commit messages for ${repoNames.length} repositories...`);
  const commitMessages = await fetchCommitMessages(
    options.token,
    options.username,
    repoNames,
    plan.range,
  );
  const totalMsgs = commitMessages.reduce((sum, r) => sum + r.messages.length, 0);
  console.log(`Collected ${totalMsgs} commit messages from ${commitMessages.length} repositories.`);

  console.log(`Fetching reviews and review comments...`);
  const reviewData = await fetchReviewsForRepos(
    options.token,
    options.username,
    repoNames,
    plan.range,
  );
  const ai = reviewData.aiReviews;
  console.log(
    `Collected ${reviewData.reviews.length} reviews and ${reviewData.comments.length} review comments` +
      ` (AI done: Codex ${ai.codex.reviews} reviews / ${ai.codex.comments} comments / ${ai.codex.prsReviewed} PRs;` +
      ` Cursor ${ai.cursor.reviews} reviews / ${ai.cursor.comments} comments / ${ai.cursor.prsReviewed} PRs).`,
  );

  console.log(`Fetching releases for ${repoNames.length} repositories...`);
  const releases = await fetchReleases(options.token, repoNames, plan.range);
  console.log(`Collected ${releases.length} releases.`);

  const repositories = aggregateRepositories(pullRequests, [], commitMessages);
  const totalAdditions = pullRequests.reduce((sum, pr) => sum + pr.additions, 0);
  const totalDeletions = pullRequests.reduce((sum, pr) => sum + pr.deletions, 0);

  const timestamps = collectTimestamps(events, commitMessages, pullRequests, reviewData);
  const commitCountFromMessages = commitMessages.reduce(
    (sum, r) => sum + (r.commits?.length ?? r.messages.length),
    0,
  );
  const hoursEstimate = estimateHours(
    timestamps,
    {
      pullRequests: authored.map((pr) => ({
        additions: pr.additions,
        deletions: pr.deletions,
        state: pr.state,
      })),
      reviewCount: reviewData.reviews.length,
      reviewCommentCount: reviewData.comments.length,
      commitCount: commitCountFromMessages,
    },
    {
      gapMinutes: options.sessionGapMinutes,
      maxSessionHours: options.maxSessionHours,
    },
  );
  console.log(
    `Estimated hours: ~${hoursEstimate.hours}h ` +
      `(sessions ~${hoursEstimate.sessionHours}h / volume ~${hoursEstimate.volumeHours}h; estimate only).`,
  );

  const partial: Omit<WeeklyReportData, "aiContent"> = {
    username: contributions.username,
    avatarUrl: contributions.avatarUrl,
    profile: contributions.profile,
    dateRange: { from: plan.rangeFrom, to: plan.rangeTo },
    stats: {
      totalCommits: Math.max(contributions.totalCommits, commitCountFromMessages),
      totalAdditions,
      totalDeletions,
      prsOpened,
      prsMerged,
      prsInProgress: prsInProgress.length,
      prsReviewed: Math.max(contributions.prsReviewed, reviewData.reviews.length),
      reviewComments: reviewData.comments.length,
      issuesOpened: 0,
      issuesClosed: 0,
      estimatedHours: hoursEstimate.hours,
    },
    dailyCommits: contributions.dailyCommits,
    repositories,
    pullRequests,
    prsInProgress,
    issues: [],
    events: events.filter((e) => e.payload.kind === "review" || e.payload.kind === "push"),
    commitMessages,
    releases,
    externalContributions: [],
    codeReviews: reviewData.reviews,
    reviewComments: reviewData.comments,
    aiReviews: reviewData.aiReviews,
    hoursEstimate,
  };

  const stakeholderSummary = buildStakeholderSummary(partial);
  const githubData = { ...partial, stakeholderSummary };

  const dataPath = join(plan.reportDir, "github-data.yaml");
  await writeFile(dataPath, toYaml(githubData, { lineWidth: 120 }), "utf-8");
  console.log(`GitHub data written to ${dataPath}`);
  console.log(`Total: ${pullRequests.length} PRs (${prsInProgress.length} in progress), ~${hoursEstimate.hours}h estimated`);
};

const runDailyFetch = async (options: BaseOptions): Promise<void> => {
  const plan = options.date
    ? buildExactDayPlan(options.date, options.timezone, options.dataDir)
    : buildDailyPlan(new Date(), options.timezone, options.dataDir);
  await runFullFetch(options, plan, "daily-fetch");
};

const runWeeklyFetch = async (options: BaseOptions): Promise<void> => {
  const now = options.date ?? new Date();
  await runFullFetch(
    options,
    buildWeeklyPlan(now, options.timezone, options.dataDir),
    "weekly-fetch",
  );
};

const baseOptions = (cmd: Command): Command =>
  cmd
    .option("-t, --token <token>", "GitHub token (env: GITHUB_TOKEN / GH_PAT)")
    .option("-u, --username <username>", "GitHub username (env: GITHUB_USERNAME)")
    .option("--data-dir <dir>", "Data directory (env: DATA_DIR, default: ./data)")
    .option("--timezone <tz>", "IANA timezone (env: TIMEZONE, default: UTC)")
    .option("--date <date>", "Report date (YYYY-MM-DD, default: previous workday)")
    .option("--config <path>", "YAML config path (env: CONFIG_PATH, default: ./config.yaml)");

export const formatCommitMsg = (mode: string, plan: FetchPlan): string =>
  mode === "daily"
    ? `data: daily ${plan.weekPath} ${plan.range.from.toISOString()}..${plan.range.to.toISOString()}`
    : `data: weekly ${plan.weekPath} ${plan.range.from.toISOString()}..${plan.range.to.toISOString()}`;

export const registerFetch = (program: Command): void => {
  baseOptions(
    program
      .command("daily-fetch")
      .description("Build a complete report dataset for one day (default: previous workday)"),
  ).action(async (opts) => {
    try {
      const options = await resolveBaseOptions(opts);
      await runDailyFetch(options);
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

  baseOptions(
    program
      .command("weekly-fetch")
      .description("Build full Thu–Wed weekly data from events + PR/review/commit fetches"),
  ).action(async (opts) => {
    try {
      const options = await resolveBaseOptions(opts);
      await runWeeklyFetch(options);
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

  program
    .command("commit-msg")
    .description("Print a commit message for the given mode (used by action.yml)")
    .argument("<mode>", "daily or weekly")
    .option("--timezone <tz>", "IANA timezone (env: TIMEZONE, default: UTC)")
    .option("--date <date>", "Target date (YYYY-MM-DD, default: today)")
    .option("--data-dir <dir>", "Data directory (default: ./data)")
    .action((mode: string, opts: Record<string, string | undefined>) => {
      const timezone = opts.timezone ?? env("TIMEZONE") ?? "UTC";
      const dataDir = opts.dataDir ?? env("DATA_DIR") ?? "./data";
      const now = opts.date ? parseLocalDate(opts.date, timezone) : new Date();
      const plan = mode === "daily"
        ? buildDailyPlan(now, timezone, dataDir)
        : buildWeeklyPlan(now, timezone, dataDir);
      process.stdout.write(formatCommitMsg(mode, plan));
    });
};
