// generate command: read github-data.yaml and generate LLM content (or stakeholder fallback)

import { Command } from "commander";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml, stringify as toYaml } from "yaml";
import { generateContent } from "../../llm/index.js";
import { resolveDayId } from "../../deployer/day.js";
import { getWeekId } from "../../deployer/week.js";
import { parseLocalDate } from "../../collector/date-range.js";
import { buildFallbackAIContent, buildStakeholderSummary } from "../../collector/stakeholder-summary.js";
import { loadConfigFile, resolveConfig } from "../../config.js";
import type { WeeklyReportData, LLMProvider, Language } from "../../types.js";

const env = (key: string): string | undefined => process.env[key];

export type GenerateOptions = {
  dataDir: string;
  llmProvider: LLMProvider | null;
  llmApiKey: string | null;
  llmModel: string | null;
  language: Language;
  timezone: string;
  date?: Date;
  allowFallback: boolean;
  mode: "daily" | "weekly";
};

const providerKeyMap: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  groq: "GROQ_API_KEY",
  grok: "GROK_API_KEY",
};

export const resolveOptions = async (
  cli: Record<string, string | undefined>,
): Promise<GenerateOptions> => {
  const configPath = cli.config ?? env("CONFIG_PATH") ?? "./config.yaml";
  const fileCfg = await loadConfigFile(configPath);
  const cfg = resolveConfig(fileCfg, cli);

  const llmProviderRaw = cli.llmProvider ?? cfg.llm.provider ?? env("LLM_PROVIDER") ?? null;
  const llmProvider = (llmProviderRaw && String(llmProviderRaw).length > 0
    ? llmProviderRaw
    : null) as LLMProvider | null;
  let llmApiKey: string | null = cli.llmApiKey ?? null;
  if (!llmApiKey && llmProvider) {
    const envVarName = providerKeyMap[llmProvider];
    llmApiKey = envVarName ? env(envVarName) ?? null : null;
  }
  const llmModel = cli.llmModel ?? cfg.llm.model ?? env("LLM_MODEL") ?? null;

  const language = cfg.language;
  const timezone = cfg.timezone;
  const date = cli.date ? parseLocalDate(cli.date, timezone) : undefined;
  const allowFallback = cli.requireLlm !== "true";
  const mode = cli.mode ?? env("REPORT_MODE") ?? "daily";
  if (mode !== "daily" && mode !== "weekly") throw new Error(`Unknown report mode "${mode}". Use daily or weekly.`);

  return {
    dataDir: cfg.dataDir,
    llmProvider,
    llmApiKey,
    llmModel,
    language,
    timezone,
    date,
    allowFallback,
    mode,
  };
};

const run = async (options: GenerateOptions): Promise<void> => {
  const dayId = options.mode === "weekly"
    ? getWeekId(options.date ?? new Date(), options.timezone)
    : resolveDayId(options.date, options.timezone);
  const dataDir = join(options.dataDir, dayId.path);
  const dataPath = join(dataDir, "github-data.yaml");

  console.log(`Reading ${dataPath}...`);
  const raw = await readFile(dataPath, "utf-8");
  const data = parseYaml(raw) as WeeklyReportData;

  data.stakeholderSummary = buildStakeholderSummary(data);

  const canUseLlm = Boolean(options.llmProvider && options.llmApiKey && options.llmModel);

  let aiContent;
  if (canUseLlm) {
    console.log(`Generating AI content (${options.llmProvider}/${options.llmModel}, lang: ${options.language})...`);
    aiContent = await generateContent(
      { ...data, language: options.language },
      {
        provider: options.llmProvider!,
        apiKey: options.llmApiKey!,
        model: options.llmModel!,
        language: options.language,
      },
    );
    // Stakeholder blurb is a dedicated field; AI overview is only shown when it differs.
  } else if (options.allowFallback) {
    console.log("No LLM configured — generating report fallback content.");
    aiContent = buildFallbackAIContent(data);
  } else {
    throw new Error(
      "LLM provider, API key, and model are required. Pass flags/env vars, or omit --require-llm to use the stakeholder fallback.",
    );
  }

  const llmDataPath = join(dataDir, "llm-data.yaml");
  await writeFile(llmDataPath, toYaml(aiContent, { lineWidth: 120 }), "utf-8");
  console.log(`LLM data written to ${llmDataPath}`);

  // Keep github-data stakeholderSummary in sync (default is empty — no stats dump).
  await writeFile(dataPath, toYaml(data, { lineWidth: 120 }), "utf-8");
};

export const registerGenerate = (program: Command): void => {
  program
    .command("generate")
    .description("Generate AI or stakeholder summary content from fetched GitHub data")
    .option("--data-dir <dir>", "Data directory (env: DATA_DIR, default: ./data)")
    .option("--llm-provider <provider>", "LLM provider (env: LLM_PROVIDER)")
    .option("--llm-api-key <key>", "LLM API key (env: OPENROUTER_API_KEY / …)")
    .option("--llm-model <model>", "LLM model name (env: LLM_MODEL)")
    .option("--language <lang>", "Report language (env: LANGUAGE, default: en)")
    .option("--timezone <tz>", "IANA timezone (env: TIMEZONE, default: UTC)")
    .option("--date <date>", "Report date (YYYY-MM-DD, default: previous workday)")
    .option("--mode <mode>", "Archive mode: daily or weekly (env: REPORT_MODE, default: daily)")
    .option("--config <path>", "YAML config path (env: CONFIG_PATH, default: ./config.yaml)")
    .option("--require-llm", "Fail if LLM is not configured (default: allow stakeholder fallback)")
    .action(async (opts) => {
      try {
        const options = await resolveOptions(opts);
        if (opts.requireLlm) options.allowFallback = false;
        await run(options);
      } catch (error) {
        console.error("Error:", error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });
};
