import { describe, it, expect } from "vitest";
import {
  estimateHoursFromTimestamps,
  estimateHours,
  estimatePrHours,
  estimateDailyPrWorkHours,
  estimateVolumeHours,
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
    expect(result.version).toBe("2.0");
    expect(result.note).toMatch(/conventional engineering effort/i);
    expect(result.note).toMatch(/not tracked, elapsed, or billed time/i);
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
