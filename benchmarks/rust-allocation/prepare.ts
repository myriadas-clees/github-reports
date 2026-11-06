// Prepare private report data in memory; stdout is consumed by the local benchmark only.
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import { loadConfigFile, resolveConfig } from "../../src/config.js";
import { normalizeReportData, withRecomputedHours } from "../../src/cli/commands/render.js";
import { weekStart, weekEnd } from "../../src/collector/allocation.js";
import type { WeeklyReportData } from "../../src/types.js";

const config = resolveConfig(await loadConfigFile(process.env.CONFIG_PATH ?? "config.yaml"));
const dataDir = process.env.DATA_DIR ?? config.dataDir;
const paths: { path: string; date: string }[] = [];
for (const year of (await readdir(dataDir)).filter((x) => /^\d{4}$/.test(x))) {
  for (const month of (await readdir(join(dataDir, year))).filter((x) => /^\d{2}$/.test(x))) {
    for (const day of (await readdir(join(dataDir, year, month))).filter((x) => /^\d{2}$/.test(x))) {
      paths.push({ path: join(dataDir, year, month, day, "github-data.yaml"), date: `${year}-${month}-${day}` });
    }
  }
}
const reports = (await Promise.all(paths.map(async ({ path, date }) => {
  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const raw = parse(source) as WeeklyReportData;
  return { date, data: withRecomputedHours(normalizeReportData(raw)) };
}))).filter((x): x is NonNullable<typeof x> => x !== null).sort((a, b) => a.date.localeCompare(b.date));
if (!reports.length) throw new Error("No daily reports available for the benchmark");

const latest = reports.at(-1)!.date;
const weeklyEnds = [...new Set(reports.map((r) => weekStart(r.date)))]
  .map((start) => weekEnd(start) < latest ? weekEnd(start) : latest);
const ends = [...reports.map((r) => r.date), ...weeklyEnds];
const requests = ends.map((end) => {
  const start = Date.parse(`${weekStart(end)}T00:00:00Z`);
  const windows = Array.from({ length: Math.max(1, Math.floor(config.allocation.trendWeeks)) }, (_, i) => {
    const from = new Date(start - (config.allocation.trendWeeks - 1 - i) * 7 * 86_400_000).toISOString().slice(0, 10);
    return { from, to: weekEnd(from) };
  });
  return { end, windows };
});
process.stdout.write(JSON.stringify({ reports, config: config.allocation, manual: config.manualTime, requests }));
