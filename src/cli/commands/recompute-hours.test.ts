import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { stringify as toYaml, parse as parseYaml } from "yaml";
import { recomputeHoursFile, runRecomputeHours } from "./recompute-hours.js";
import type { WeeklyReportData } from "../../types.js";

const baseData = (hours: number, withInputs: boolean): WeeklyReportData => ({
  username: "alice",
  avatarUrl: "https://example.com/a.png",
  dateRange: { from: "2026-06-16", to: "2026-06-16" },
  stats: {
    totalCommits: 3,
    totalAdditions: 0,
    totalDeletions: 0,
    prsOpened: 0,
    prsMerged: 0,
    prsInProgress: 0,
    prsReviewed: 0,
    reviewComments: 0,
    issuesOpened: 0,
    issuesClosed: 0,
    estimatedHours: hours,
  },
  dailyCommits: [],
  repositories: [],
  pullRequests: [],
  issues: [],
  events: [],
  commitMessages: [],
  releases: [],
  externalContributions: [],
  hoursEstimate: {
    version: "1.0",
    hours,
    sessions: 0,
    sessionHours: 0,
    volumeHours: hours,
    gapMinutes: 90,
    maxSessionHours: 6,
    note: "old",
  },
  ...(withInputs
    ? {
      hoursInputs: {
        timestamps: [] as string[],
        volume: {
          commitCount: 3,
          commitAdditions: 4000,
          commitDeletions: 200,
          commitStatsCount: 3,
        },
        options: { gapMinutes: 90, maxSessionHours: 6, minimumHours: 8 },
      },
    }
    : {}),
  aiContent: {
    title: "t",
    subtitle: "s",
    overview: "",
    summaries: [],
    highlights: [],
    ticker: [],
  },
});

describe("recomputeHoursFile", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "recompute-hours-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("skips files without hoursInputs", async () => {
    const file = join(dir, "github-data.yaml");
    await writeFile(file, toYaml(baseData(3, false)));
    expect(await recomputeHoursFile(file)).toBe("skipped");
  });

  it("rewrites estimated hours from hoursInputs", async () => {
    const file = join(dir, "github-data.yaml");
    await writeFile(file, toYaml(baseData(1, true)));
    expect(await recomputeHoursFile(file)).toBe("updated");
    const next = parseYaml(await readFile(file, "utf-8")) as WeeklyReportData;
    expect(next.stats.estimatedHours).toBe(9);
    expect(next.hoursEstimate?.hours).toBe(9);
    expect(next.hoursEstimate?.version).toBe("2.1");
  });
});

describe("runRecomputeHours", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "recompute-hours-walk-"));
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  it("updates dated reports and respects --from/--to", async () => {
    const day = join(dir, "2026", "06", "16");
    await mkdir(day, { recursive: true });
    await writeFile(join(day, "github-data.yaml"), toYaml(baseData(1, true)));

    const other = join(dir, "2026", "07", "01");
    await mkdir(other, { recursive: true });
    await writeFile(join(other, "github-data.yaml"), toYaml({
      ...baseData(1, true),
      dateRange: { from: "2026-07-01", to: "2026-07-01" },
    }));

    const result = await runRecomputeHours({ dataDir: dir, from: "2026-06-16", to: "2026-06-16" });
    expect(result.updated).toBe(1);
    expect(result.skipped).toBe(0);

    const june = parseYaml(await readFile(join(day, "github-data.yaml"), "utf-8")) as WeeklyReportData;
    const july = parseYaml(await readFile(join(other, "github-data.yaml"), "utf-8")) as WeeklyReportData;
    expect(june.stats.estimatedHours).toBe(9);
    expect(july.stats.estimatedHours).toBe(1);
  });
});
