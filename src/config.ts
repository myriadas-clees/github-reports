// Load YAML configuration with environment variable overrides.
// Secrets (tokens, API keys) come only from env / CLI — never from HTML output.

import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import type { Language, LLMProvider, Theme } from "./types.js";

export type WorklogConfig = {
  username: string;
  timezone: string;
  language: Language;
  theme: Theme;
  /** Explicit private/public repos to include. Empty = discover from activity. */
  repositories: string[];
  siteTitle: string;
  dataDir: string;
  outputDir: string;
  /** Gap (minutes) between activity timestamps that starts a new work session. */
  sessionGapMinutes: number;
  /** Cap hours credited per single session (estimate). */
  maxSessionHours: number;
  llm: {
    provider: LLMProvider | null;
    model: string | null;
  };
};

export const DEFAULT_CONFIG: WorklogConfig = {
  username: "",
  timezone: "UTC",
  language: "en",
  theme: "brutalist",
  repositories: [],
  siteTitle: "devlog",
  dataDir: "./data",
  outputDir: "./output",
  sessionGapMinutes: 90,
  maxSessionHours: 6,
  llm: { provider: null, model: null },
};

type RawConfig = {
  username?: string;
  timezone?: string;
  language?: string;
  theme?: string;
  repositories?: string[];
  site_title?: string;
  siteTitle?: string;
  data_dir?: string;
  dataDir?: string;
  output_dir?: string;
  outputDir?: string;
  session_gap_minutes?: number;
  sessionGapMinutes?: number;
  max_session_hours?: number;
  maxSessionHours?: number;
  llm?: {
    provider?: string;
    model?: string;
  };
};

const env = (key: string): string | undefined => {
  const v = process.env[key];
  return v && v.length > 0 ? v : undefined;
};

export const parseConfigObject = (raw: RawConfig | null | undefined): Partial<WorklogConfig> => {
  if (!raw || typeof raw !== "object") return {};
  const out: Partial<WorklogConfig> = {};
  if (raw.username) out.username = raw.username;
  if (raw.timezone) out.timezone = raw.timezone;
  if (raw.language) out.language = raw.language as Language;
  if (raw.theme) out.theme = raw.theme as Theme;
  if (Array.isArray(raw.repositories)) {
    out.repositories = raw.repositories
      .filter((r): r is string => typeof r === "string")
      .map((r) => r.trim())
      .filter(Boolean);
  }
  const siteTitle = raw.site_title ?? raw.siteTitle;
  if (siteTitle) out.siteTitle = siteTitle;
  const dataDir = raw.data_dir ?? raw.dataDir;
  if (dataDir) out.dataDir = dataDir;
  const outputDir = raw.output_dir ?? raw.outputDir;
  if (outputDir) out.outputDir = outputDir;
  const gap = raw.session_gap_minutes ?? raw.sessionGapMinutes;
  if (typeof gap === "number" && gap > 0) out.sessionGapMinutes = gap;
  const maxH = raw.max_session_hours ?? raw.maxSessionHours;
  if (typeof maxH === "number" && maxH > 0) out.maxSessionHours = maxH;
  if (raw.llm) {
    out.llm = {
      provider: (raw.llm.provider as LLMProvider) ?? null,
      model: raw.llm.model ?? null,
    };
  }
  return out;
};

export const loadConfigFile = async (path?: string | null): Promise<Partial<WorklogConfig>> => {
  if (!path) return {};
  try {
    const raw = await readFile(path, "utf-8");
    if (typeof raw !== "string" || raw.length === 0) return {};
    return parseConfigObject(parseYaml(raw) as RawConfig);
  } catch {
    return {};
  }
};

/** Merge file config < defaults, then apply env overrides. */
export const resolveConfig = (
  filePartial: Partial<WorklogConfig> = {},
  cli: Record<string, string | undefined> = {},
): WorklogConfig => {
  const merged: WorklogConfig = {
    ...DEFAULT_CONFIG,
    ...filePartial,
    llm: { ...DEFAULT_CONFIG.llm, ...filePartial.llm },
    repositories: filePartial.repositories ?? DEFAULT_CONFIG.repositories,
  };

  if (cli.username ?? env("GITHUB_USERNAME")) {
    merged.username = cli.username ?? env("GITHUB_USERNAME")!;
  }
  if (cli.timezone ?? env("TIMEZONE")) {
    merged.timezone = cli.timezone ?? env("TIMEZONE")!;
  }
  if (cli.language ?? env("LANGUAGE")) {
    merged.language = (cli.language ?? env("LANGUAGE")) as Language;
  }
  if (cli.theme ?? env("THEME")) {
    merged.theme = (cli.theme ?? env("THEME")) as Theme;
  }
  if (cli.dataDir ?? env("DATA_DIR")) {
    merged.dataDir = cli.dataDir ?? env("DATA_DIR")!;
  }
  if (cli.outputDir ?? env("OUTPUT_DIR")) {
    merged.outputDir = cli.outputDir ?? env("OUTPUT_DIR")!;
  }
  if (cli.siteTitle ?? env("SITE_TITLE")) {
    merged.siteTitle = cli.siteTitle ?? env("SITE_TITLE")!;
  }
  if (cli.llmProvider ?? env("LLM_PROVIDER")) {
    const provider = (cli.llmProvider ?? env("LLM_PROVIDER")) as LLMProvider;
    merged.llm.provider = provider || null;
  }
  if (cli.llmModel ?? env("LLM_MODEL")) {
    merged.llm.model = cli.llmModel ?? env("LLM_MODEL") ?? null;
  }

  const reposEnv = env("REPOSITORIES");
  if (reposEnv) {
    merged.repositories = reposEnv.split(",").map((r) => r.trim()).filter(Boolean);
  }

  return merged;
};

/** Strip anything that must never appear in generated HTML / YAML published to Pages. */
export const SECRET_ENV_KEYS = [
  "GITHUB_TOKEN",
  "GH_PAT",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "OPENROUTER_API_KEY",
  "GROQ_API_KEY",
  "GROK_API_KEY",
] as const;

export const assertNoSecretsInHtml = (html: string): void => {
  for (const key of SECRET_ENV_KEYS) {
    const value = env(key);
    if (value && value.length >= 8 && html.includes(value)) {
      throw new Error(`Refusing to write HTML: secret value from ${key} would be exposed.`);
    }
  }
};
