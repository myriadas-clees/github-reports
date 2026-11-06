// Both modes receive the same serialized snapshot and produce the same complete output.
import { readFileSync } from "node:fs";
import {
  buildAllocationTrend, computeAllocation, mergeAllocations,
} from "../../src/collector/allocation.js";
import { formatShortWeekTitle } from "../../src/collector/stakeholder-summary.js";
import type { Allocation, AllocationConfig, ManualTimeEntry, WeeklyReportData } from "../../src/types.js";

type Report = { date: string; data: WeeklyReportData };
type Request = { end: string; windows: { from: string; to: string }[] };
type Input = { reports: Report[]; config: AllocationConfig; manual: ManualTimeEntry[]; requests: Request[] };
const input = JSON.parse(readFileSync(0, "utf8")) as Input;
const { reports, config, manual, requests } = input;
const daily = reports.map((report) => computeAllocation(report.data, config, manual));
const periodCache = new Map<string, { id: string; label: string; from: string; to: string; days: number; allocation: Allocation }>();

function memoizedTrend(request: Request) {
  const totals = new Map<string, number>();
  const periods = request.windows.map(({ from, to }) => {
    const key = JSON.stringify([from, to, request.end < to ? request.end : to]);
    const cached = periodCache.get(key);
    if (cached) {
      for (const bucket of cached.allocation.initiatives) totals.set(bucket.initiative, (totals.get(bucket.initiative) ?? 0) + bucket.hours);
      return cached;
    }
    const indices = reports.flatMap((report, i) => {
      const date = report.date.slice(0, 10);
      return date >= from && date <= to && date <= request.end ? [i] : [];
    });
    const allocations: Allocation[] = indices.map((i) => daily[i]);
    const extra = manual.filter((entry) => {
      const date = entry.date.slice(0, 10);
      const covered = indices.some((i) => reports[i].date.slice(0, 10) === date ||
        (reports[i].data.dateRange.from.slice(0, 10) <= date && date <= reports[i].data.dateRange.to.slice(0, 10)));
      return date >= from && date <= to && date <= request.end && !covered;
    });
    if (extra.length) allocations.push(computeAllocation({
      dateRange: { from, to },
      stats: { estimatedHours: 0 } as WeeklyReportData["stats"],
      pullRequests: [], commitMessages: [],
    }, config, extra));
    const allocation = mergeAllocations(allocations);
    for (const bucket of allocation.initiatives) totals.set(bucket.initiative, (totals.get(bucket.initiative) ?? 0) + bucket.hours);
    const period = { id: from, label: formatShortWeekTitle(from, to), from, to, days: indices.length, allocation };
    periodCache.set(key, period);
    return period;
  });
  const initiatives = [...totals.keys()].sort((a, b) => totals.get(b)! - totals.get(a)! || a.localeCompare(b));
  return { initiatives, periods };
}

const trends = requests.map((request) => process.argv[2] === "memoized"
  ? memoizedTrend(request)
  : buildAllocationTrend(reports, request.end, config, manual));
process.stdout.write(JSON.stringify({ daily, trends }));
