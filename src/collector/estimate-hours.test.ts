import { describe, it, expect } from "vitest";
import {
  estimateHoursFromTimestamps,
  estimateHours,
  estimatePrHours,
  estimateDailyPrWorkHours,
  estimateVolumeHours,
  applyHoursEstimate,
  compressDailyVolume,
  buildCommitUnits,
  estimateCommitUnitHours,
  ESTIMATOR_VERSION,
} from "./estimate-hours.js";

describe("estimatePrHours", () => {
  it("scales with churn bands", () => {
    expect(estimatePrHours(10, 5)).toBe(0.75);
    expect(estimatePrHours(200, 50)).toBe(2.5);
    expect(estimatePrHours(2000, 400)).toBe(6); // churn 2400 → < 2500 band
    expect(estimatePrHours(20000, 5000)).toBe(18); // churn 25000 → < 30000
    expect(estimatePrHours(40000, 10000)).toBe(22);
  });
});

describe("estimateDailyPrWorkHours", () => {
  it("credits daily PR context, breadth, tests, and iteration", () => {
    expect(estimateDailyPrWorkHours({
      additions: 107,
      deletions: 29,
      state: "open",
      dailyWork: true,
      filesChanged: 6,
      testFilesChanged: 2,
      commitCount: 2,
    })).toBe(5.3);
  });
});

describe("estimateVolumeHours", () => {
  it("credits large PR weeks far above sparse timestamp sessions", () => {
    const hours = estimateVolumeHours({
      pullRequests: [
        { additions: 31960, deletions: 8698, state: "merged" },
        { additions: 1616, deletions: 597, state: "merged" },
        { additions: 1553, deletions: 277, state: "merged" },
        ...Array.from({ length: 24 }, () => ({
          additions: 120,
          deletions: 40,
          state: "merged",
        })),
      ],
      reviewCount: 4,
      reviewCommentCount: 4,
      commitCount: 22,
    });
    // Mega PR (~22h) + two large (~13+13) + 24 small (~1.5 each) + reviews/commits
    expect(hours).toBeGreaterThan(60);
    expect(hours).toBeLessThan(120);
  });
});

describe("estimateHours hybrid", () => {
  it("uses volume when it exceeds session clustering", () => {
    const result = estimateHours(
      ["2026-07-24T15:00:00Z", "2026-07-24T15:20:00Z"],
      {
        pullRequests: [{ additions: 31960, deletions: 8698, state: "merged" }],
        commitCount: 5,
      },
    );
    expect(result.sessionHours).toBeLessThan(2);
    expect(result.volumeHours).toBeGreaterThanOrEqual(22);
    expect(result.hours).toBe(result.volumeHours);
    expect(result.version).toBe("2.3");
    expect(result.note).toMatch(/work delivered/i);
    expect(result.note).toMatch(/not actual hours worked/i);
  });

  it("uses session hours when they exceed volume", () => {
    const stamps: string[] = [];
    for (let h = 9; h <= 14; h++) {
      stamps.push(`2026-07-24T${String(h).padStart(2, "0")}:00:00Z`);
      stamps.push(`2026-07-24T${String(h).padStart(2, "0")}:30:00Z`);
    }
    const result = estimateHours(
      stamps,
      { pullRequests: [{ additions: 20, deletions: 5, state: "merged" }] },
      { gapMinutes: 90, maxSessionHours: 6 },
    );
    expect(result.sessionHours).toBe(5.5); // 9:00 → 14:30
    expect(result.hours).toBe(result.sessionHours);
  });
});

describe("estimateHoursFromTimestamps", () => {
  it("returns zero for empty input", () => {
    const result = estimateHoursFromTimestamps([]);
    expect(result.hours).toBe(0);
    expect(result.sessions).toBe(0);
    expect(result.note).toMatch(/estimate/i);
  });

  it("credits a minimum duration for a single timestamp", () => {
    const result = estimateHoursFromTimestamps(["2026-04-02T15:00:00Z"]);
    expect(result.sessions).toBe(1);
    expect(result.hours).toBe(0.5);
  });

  it("clusters close timestamps into one session", () => {
    const result = estimateHoursFromTimestamps(
      [
        "2026-04-02T10:00:00Z",
        "2026-04-02T10:30:00Z",
        "2026-04-02T11:00:00Z",
      ],
      { gapMinutes: 90, maxSessionHours: 6 },
    );
    expect(result.sessions).toBe(1);
    expect(result.hours).toBe(1);
  });

  it("splits sessions across a large gap", () => {
    const result = estimateHoursFromTimestamps(
      [
        "2026-04-02T10:00:00Z",
        "2026-04-02T10:20:00Z",
        "2026-04-02T14:00:00Z",
        "2026-04-02T14:30:00Z",
      ],
      { gapMinutes: 90, maxSessionHours: 6 },
    );
    expect(result.sessions).toBe(2);
    // Each short cluster gets the 0.5h minimum → 1.0h total
    expect(result.hours).toBe(1);
  });

  it("caps a long continuous session", () => {
    const stamps: string[] = [];
    for (let m = 0; m <= 8 * 60; m += 30) {
      const h = 8 + Math.floor(m / 60);
      const min = String(m % 60).padStart(2, "0");
      stamps.push(`2026-04-02T${String(h).padStart(2, "0")}:${min}:00Z`);
    }
    const result = estimateHoursFromTimestamps(stamps, {
      gapMinutes: 90,
      maxSessionHours: 6,
    });
    expect(result.sessions).toBe(1);
    expect(result.hours).toBe(6);
  });
});

describe("direct-commit churn volume", () => {
  it("scores aggregated commit churn with PR bands", () => {
    expect(estimateVolumeHours({
      commitCount: 3,
      commitAdditions: 4000,
      commitDeletions: 200,
      commitStatsCount: 3,
    })).toBe(9);
  });

  it("falls back to 0.5h per commit when stats are missing", () => {
    expect(estimateVolumeHours({ commitCount: 55 })).toBe(27.5);
  });
});

describe("weekday hour floor", () => {
  it("raises hours to 8 when session and volume are lower", () => {
    const result = estimateHours(
      ["2026-06-16T15:00:00Z"],
      { commitCount: 3 },
      { minimumHours: 8 },
    );
    expect(result.sessionHours).toBe(0.5);
    expect(result.volumeHours).toBe(1.5);
    expect(result.hours).toBe(8);
  });

  it("does not apply a floor when minimumHours is omitted", () => {
    const result = estimateHours([], {});
    expect(result.hours).toBe(0);
  });
});

describe("compressDailyVolume", () => {
  it("counts the first 16h at full value", () => {
    expect(compressDailyVolume(10)).toBe(10);
    expect(compressDailyVolume(16)).toBe(16);
  });

  it("counts 16–40h at 50%", () => {
    expect(compressDailyVolume(30)).toBe(23);
    expect(compressDailyVolume(40)).toBe(28);
  });

  it("counts hours above 40h at 25%", () => {
    expect(compressDailyVolume(132.9)).toBe(51.2);
  });

  it("returns 0 for zero, negative, and NaN input", () => {
    expect(compressDailyVolume(0)).toBe(0);
    expect(compressDailyVolume(-5)).toBe(0);
    expect(compressDailyVolume(Number.NaN)).toBe(0);
  });
});

describe("daily vs weekly volume compression", () => {
  // 132.9h of raw volume: 10 PRs' worth of churn plus reviews, mirroring a very busy day.
  const busyDay = {
    pullRequests: Array.from({ length: 10 }, () => ({
      additions: 40_000,
      deletions: 20_000,
      state: "merged",
    })),
    reviewCount: 36,
  };

  it("compresses volume when minimumHours marks a daily estimate", () => {
    const result = estimateHours([], busyDay, { minimumHours: 8 });
    expect(result.volumeHours).toBeGreaterThan(100);
    expect(result.compressedVolumeHours).toBe(compressDailyVolume(result.volumeHours));
    expect(result.hours).toBe(result.compressedVolumeHours);
    expect(result.hours).toBeLessThan(result.volumeHours);
  });

  it("does not compress when minimumHours is 0 (weekly estimate)", () => {
    const result = estimateHours([], busyDay, { minimumHours: 0 });
    expect(result.compressedVolumeHours).toBeUndefined();
    expect(result.hours).toBe(result.volumeHours);
  });

  it("does not compress when minimumHours is omitted", () => {
    const result = estimateHours([], busyDay);
    expect(result.compressedVolumeHours).toBeUndefined();
    expect(result.hours).toBe(result.volumeHours);
  });

  it("keeps the raw volume in the result and mentions diminishing returns in the note", () => {
    const result = estimateHours([], busyDay, { minimumHours: 8 });
    expect(result.note).toMatch(/diminishing returns/i);
  });
});

describe("applyHoursEstimate", () => {
  it("leaves data unchanged when hoursInputs is missing", () => {
    const data = { stats: { estimatedHours: 3 }, hoursEstimate: { hours: 3 } as never };
    expect(applyHoursEstimate(data)).toBe(data);
  });

  it("recomputes hours and version from hoursInputs", () => {
    const data = {
      stats: { estimatedHours: 1 },
      hoursEstimate: {
        version: "1.0",
        hours: 1,
        sessions: 0,
        sessionHours: 0,
        volumeHours: 1,
        gapMinutes: 90,
        maxSessionHours: 6,
        note: "old",
      },
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
    };
    const next = applyHoursEstimate(data);
    expect(next.stats.estimatedHours).toBe(9);
    expect(next.hoursEstimate?.hours).toBe(9);
    expect(next.hoursEstimate?.version).toBe(ESTIMATOR_VERSION);
  });
});

describe("buildCommitUnits", () => {
  const c = (message: string, extra: Record<string, unknown> = {}) => ({ message, repo: "o/a", additions: 10, deletions: 0, ...extra });

  it("groups by conventional scope across types", () => {
    const units = buildCommitUnits([c("feat(pricing): a"), c("fix(pricing): b"), c("fix(ui): c")]);
    expect(units.map((u) => u.commitCount).sort()).toEqual([1, 2]);
    expect(units.find((u) => u.commitCount === 2)?.additions).toBe(20);
  });

  it("falls back to type, then misc", () => {
    const units = buildCommitUnits([c("fix: a"), c("fix: b"), c("random words"), c("more words")]);
    expect(units.map((u) => u.commitCount).sort()).toEqual([2, 2]);
  });

  it("separates repos", () => {
    expect(buildCommitUnits([c("fix(x): a"), { ...c("fix(x): b"), repo: "o/b" }])).toHaveLength(2);
  });

  it("sums file counts and detects test files", () => {
    const [u] = buildCommitUnits([c("feat(x): a", { files: ["a.ts", "a.test.ts"] }), c("feat(x): b", { filesChanged: 3 })]);
    expect(u.filesChanged).toBe(5);
    expect(u.testFilesChanged).toBe(1);
  });

  it("uses capped 0.5h per commit without stats", () => {
    const noStats = (n: number) => buildCommitUnits(Array.from({ length: n }, () => ({ message: "fix(x): a", repo: "o/a" })));
    expect(estimateCommitUnitHours(noStats(2)[0])).toBe(1);
    expect(estimateCommitUnitHours(noStats(20)[0])).toBe(2.25);
  });
});

describe("commit units in the volume estimate", () => {
  it("estimates each unit like a PR's daily work instead of one lumped band", () => {
    const units = buildCommitUnits([
      { message: "feat(a): x", repo: "o/a", additions: 100, deletions: 0 },
      { message: "feat(b): y", repo: "o/a", additions: 100, deletions: 0 },
    ]);
    const legacy = estimateVolumeHours({ commitCount: 2, commitAdditions: 200, commitDeletions: 0, commitStatsCount: 2 });
    const withUnits = estimateVolumeHours({ commitCount: 2, commitAdditions: 200, commitDeletions: 0, commitStatsCount: 2, commitUnits: units });
    expect(legacy).toBe(2.5);
    expect(withUnits).toBe(2 * estimateDailyPrWorkHours({ additions: 100, deletions: 0, state: "merged", dailyWork: true, commitCount: 1 }));
  });

  it("applyHoursEstimate derives units and excludes PR work commits", () => {
    const base = {
      stats: { estimatedHours: 0 },
      hoursInputs: {
        timestamps: [],
        volume: { commitCount: 2, commitAdditions: 20, commitDeletions: 0, commitStatsCount: 2 },
        options: { gapMinutes: 90, maxSessionHours: 6 },
      },
      commitMessages: [{
        repo: "o/a",
        messages: ["feat(x): a", "feat(x): b"],
        commits: [
          { sha: "1", message: "feat(x): a", additions: 10, deletions: 0 },
          { sha: "2", message: "feat(x): b", additions: 10, deletions: 0 },
        ],
      }],
      pullRequests: [],
    };
    const volumeOf = (d: Parameters<typeof applyHoursEstimate>[0]): number | undefined =>
      (applyHoursEstimate(d) as { hoursEstimate?: { volumeHours?: number } }).hoursEstimate?.volumeHours;
    const all = volumeOf(base);
    const unit = estimateDailyPrWorkHours({ additions: 20, deletions: 0, state: "merged", dailyWork: true, commitCount: 2 });
    expect(all).toBe(unit);
    const excluded = volumeOf({ ...base, pullRequests: [{ workCommits: [{ sha: "2" }] }] });
    expect(excluded).toBe(
      estimateDailyPrWorkHours({ additions: 10, deletions: 0, state: "merged", dailyWork: true, commitCount: 1 }),
    );
  });

  it("excludes closed worked-on PR commits when rebuilding direct commit units", () => {
    const base = {
      stats: { estimatedHours: 0 },
      hoursInputs: {
        timestamps: [],
        volume: {
          pullRequests: [{ additions: 10, deletions: 0, state: "closed", dailyWork: true, commitCount: 1 }],
          commitCount: 1,
          commitAdditions: 10,
          commitDeletions: 0,
          commitStatsCount: 1,
        },
        options: { gapMinutes: 90, maxSessionHours: 6 },
      },
      commitMessages: [{ repo: "o/a", messages: ["fix(x): a"], commits: [
        { sha: "closed-pr-sha", message: "fix(x): a", additions: 10, deletions: 0 },
      ] }],
    };
    const withPr = applyHoursEstimate({
      ...base,
      prsWorkedOnClosed: [{ workCommits: [{ sha: "closed-pr-sha" }] }],
    });
    const withoutDuplicate = applyHoursEstimate({
      ...base,
      hoursInputs: { ...base.hoursInputs, volume: { ...base.hoursInputs.volume, commitCount: 0, commitAdditions: 0, commitDeletions: 0, commitStatsCount: 0 } },
      commitMessages: [],
    });
    expect((withPr as { hoursEstimate?: { volumeHours?: number } }).hoursEstimate?.volumeHours)
      .toBe((withoutDuplicate as { hoursEstimate?: { volumeHours?: number } }).hoursEstimate?.volumeHours);
  });
});
