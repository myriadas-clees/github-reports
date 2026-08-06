// report command: weekly-fetch → generate → render in one local invocation

import { Command } from "commander";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliEntry = resolve(__dirname, "../index.js");

const runSub = (args: string[]): Promise<void> =>
  new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [cliEntry, ...args], {
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`Command failed (${args[0]}): exit ${code}`));
    });
    child.on("error", reject);
  });

const forwardFlags = (opts: Record<string, string | boolean | undefined>): string[] => {
  const args: string[] = [];
  const map: Record<string, string> = {
    token: "--token",
    username: "--username",
    dataDir: "--data-dir",
    outputDir: "--output-dir",
    timezone: "--timezone",
    date: "--date",
    config: "--config",
    language: "--language",
    theme: "--theme",
    baseUrl: "--base-url",
    siteTitle: "--site-title",
    llmProvider: "--llm-provider",
    llmApiKey: "--llm-api-key",
    llmModel: "--llm-model",
  };
  for (const [key, flag] of Object.entries(map)) {
    const val = opts[key];
    if (typeof val === "string" && val.length > 0) {
      args.push(flag, val);
    }
  }
  return args;
};

export const registerReport = (program: Command): void => {
  program
    .command("report")
    .description("Generate a full weekly status report locally (fetch + summarize + render)")
    .option("-t, --token <token>", "GitHub token (env: GITHUB_TOKEN / GH_PAT)")
    .option("-u, --username <username>", "GitHub username (env: GITHUB_USERNAME)")
    .option("--data-dir <dir>", "Data directory (env: DATA_DIR)")
    .option("--output-dir <dir>", "HTML output directory (env: OUTPUT_DIR)")
    .option("--timezone <tz>", "IANA timezone (env: TIMEZONE)")
    .option("--date <date>", "Date within the target week (YYYY-MM-DD)")
    .option("--config <path>", "YAML config path (default: ./config.yaml)")
    .option("--language <lang>", "Report language")
    .option("--theme <theme>", "Report theme")
    .option("--base-url <url>", "Base URL for canonical links")
    .option("--site-title <title>", "Site title")
    .option("--llm-provider <provider>", "Optional LLM provider")
    .option("--llm-api-key <key>", "Optional LLM API key")
    .option("--llm-model <model>", "Optional LLM model")
    .option("--skip-deploy", "Do not deploy (always skipped by this command; deploy separately)")
    .action(async (opts) => {
      try {
        const flags = forwardFlags(opts);
        console.log("=== 1/3 weekly-fetch ===");
        await runSub(["weekly-fetch", ...flags]);
        console.log("=== 2/3 generate ===");
        await runSub(["generate", ...flags]);
        console.log("=== 3/3 render ===");
        await runSub(["render", ...flags]);
        console.log("Report complete. Open the HTML under the output directory (archived by week path).");
      } catch (error) {
        console.error("Error:", error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });
};
