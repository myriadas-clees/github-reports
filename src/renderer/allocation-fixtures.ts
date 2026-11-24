// Hand-built allocation fixtures for tests and previews (no dependency on the collector).

import type { Allocation, AllocationBucket, AllocationTrend, WorkType } from "../types.js";

export const bucket = (
  initiative: string,
  hours: number,
  total: number,
  extra: Partial<AllocationBucket> = {},
): AllocationBucket => ({
  initiative,
  hours,
  share: total > 0 ? hours / total : 0,
  byWorkType: {},
  shipped: [],
  inProgress: [],
  other: [],
  ...extra,
});

export const makeAllocation = (
  buckets: [string, number, Partial<AllocationBucket>?][],
  workTypes: [WorkType, string, number][] = [],
  extra: Partial<Allocation> = {},
): Allocation => {
  const total = buckets.reduce((n, [, h]) => n + h, 0);
  return {
    version: "1.0",
    totalHours: total,
    initiatives: buckets.map(([name, h, e]) => bucket(name, h, total, e)),
    workTypes: workTypes.map(([workType, label, hours]) => ({
      workType,
      label,
      hours,
      share: total > 0 ? hours / total : 0,
    })),
    manualHours: 0,
    note: "Estimated from PR size and review activity.",
    ...extra,
  };
};

export const emptyAllocation = (): Allocation => makeAllocation([]);

export const makeTrend = (
  initiatives: string[],
  periods: { label: string; days: number; allocation: Allocation }[],
): AllocationTrend => ({
  initiatives,
  periods: periods.map((p, i) => ({
    id: `2026-08-${String(i + 1).padStart(2, "0")}`,
    from: `2026-08-${String(i + 1).padStart(2, "0")}`,
    to: `2026-08-${String(i + 7).padStart(2, "0")}`,
    ...p,
  })),
});
