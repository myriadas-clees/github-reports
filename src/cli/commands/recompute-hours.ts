// recompute-hours: rewrite stored hour estimates from hoursInputs (no GitHub API)

import { Command } from "commander";
import { readFile, writeFile, readdir, access } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml, stringify as toYaml } from "yaml";
import { applyHoursEstimate } from "../../collector/estimate-hours.js";
import { buildStakeholderSummary } from "../../collector/stakeholder-summary.js";
import { loadConfigFile, resolveConfig } from "../../config.js";
import type { WeeklyReportData } from "../../types.js";

const env = (key: string): string | undefined => process.env[key];

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const listGithubDataPaths = async (dataDir: string): Promise<string[]> => {
  const paths: string[] = [];
  let years: string[];
  try {
    years = await readdir(dataDir);
  } catch {
    return paths;
  }
  for (const year of years.filter((n) => /^\d{4}$/.test(n))) {
    const months = await readdir(join(dataDir, year));
    for (const month of months.filter((n) => /^\d{2}$/.test(n))) {
      const days = await readdir(join(dataDir, year, month));
      for (const day of days.filter((n) => /^\d{2}$/.test(n))) {
        const file = join(dataDir, year, month, day, "github-data.yaml");
        if (await fileExists(file)) paths.push(file);
      }
    }
    for (const week of months.filter((n) => /^W\d{2}$/.test(n))) {
      const file = join(dataDir, year, week, "github-data.yaml");
      if (await fileExists(file)) paths.push(file);
    }
  }
  return paths.sort();
};

const pathDate = (file: string): string | null => {
  const match = file.match(/(\d{4})\/(\d{2})\/(\d{2})\/github-data\.yaml$/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
};

export const recomputeHoursFile = async (file: string): Promise<"updated" | "skipped" | "unchanged"> => {
  const raw = await readFile(file, "utf-8");
  const data = parseYaml(raw) as WeeklyReportData;
  if (!data.hoursInputs) return "skipped";

  const before = data.stats?.estimatedHours;
  const next: WeeklyReportData = {
    ...applyHoursEstimate(data),
    stakeholderSummary: "",
  };
  next.stakeholderSummary = buildStakeholderSummary(next);
  if (
    next.stats.estimatedHours === before &&
    next.hoursEstimate?.version === data.hoursEstimate?.version &&
    next.hoursEstimate?.hours === data.hoursEstimate?.hours
  ) {
    return "unchanged";
  }
  await writeFile(file, toYaml(next, { lineWidth: 120 }), "utf-8");
  return "updated";
};

export const runRecomputeHours = async (options: {
  dataDir: string;
  from?: string;
  to?: string;
}): Promise<{ updated: number; skipped: number; unchanged: number }> => {
  const files = await listGithubDataPaths(options.dataDir);
  let updated = 0;
  let skipped = 0;
  let unchanged = 0;

  for (const file of files) {
    const date = pathDate(file);
    if (date) {
      if (options.from && date < options.from) continue;
      if (options.to && date > options.to) continue;
    }
    const result = await recomputeHoursFile(file);
    if (result === "updated") {
      updated += 1;
      console.log(`Updated ${file}`);
    } else if (result === "skipped") {
      skipped += 1;
    } else {
      unchanged += 1;
    }
  }

  console.log(`recompute-hours: updated=${updated} unchanged=${unchanged} skipped=${skipped}`);
  return { updated, skipped, unchanged };
};

export const registerRecomputeHours = (program: Command): void => {
  program
    .command("recompute-hours")
    .description("Rewrite estimated hours from stored hoursInputs (no GitHub API)")
    .option("--data-dir <dir>", "Data directory (env: DATA_DIR, default: ./data)")
    .option("--from <date>", "Only days on/after YYYY-MM-DD")
    .option("--to <date>", "Only days on/before YYYY-MM-DD")
    .option("--config <path>", "YAML config path (env: CONFIG_PATH, default: ./config.yaml)")
    .action(async (opts) => {
      try {
        const fileCfg = await loadConfigFile(opts.config ?? env("CONFIG_PATH") ?? "./config.yaml");
        const cfg = resolveConfig(fileCfg, { dataDir: opts.dataDir ?? env("DATA_DIR") });
        await runRecomputeHours({
          dataDir: opts.dataDir ?? cfg.dataDir,
          from: opts.from,
          to: opts.to,
        });
      } catch (error) {
        console.error("Error:", error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });
};
