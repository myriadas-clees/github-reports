import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { resolveOptions } from "./generate.js";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn().mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" })),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../llm/index.js", () => ({
  generateContent: vi.fn(),
}));

vi.mock("../../deployer/week.js", () => ({
  getWeekId: () => ({ year: 2026, week: 14, path: "2026/W14" }),
}));

describe("resolveOptions", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.stubEnv("CONFIG_PATH", "/tmp/worklog-missing-config.yaml");
    vi.stubEnv("TIMEZONE", "");
    vi.stubEnv("GITHUB_USERNAME", "");
    vi.stubEnv("LANGUAGE", "");
  });

  it("allows missing LLM when fallback is enabled", async () => {
    vi.stubEnv("LLM_PROVIDER", "");
    const result = await resolveOptions({});
    expect(result.llmProvider).toBeNull();
    expect(result.allowFallback).toBe(true);
    expect(result.mode).toBe("daily");
  });

  it("preserves weekly archive mode", async () => {
    const result = await resolveOptions({ mode: "weekly" });
    expect(result.mode).toBe("weekly");
  });

  it("maps openai provider to OPENAI_API_KEY env var", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-env");
    const result = await resolveOptions({
      llmProvider: "openai",
      llmModel: "gpt-4o",
    });
    expect(result.llmApiKey).toBe("sk-env");
    expect(result.llmProvider).toBe("openai");
  });

  it("maps anthropic provider to ANTHROPIC_API_KEY env var", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant");
    const result = await resolveOptions({
      llmProvider: "anthropic",
      llmModel: "claude-3",
    });
    expect(result.llmApiKey).toBe("sk-ant");
  });

  it("maps groq provider to GROQ_API_KEY env var", async () => {
    vi.stubEnv("GROQ_API_KEY", "gsk-xxx");
    const result = await resolveOptions({
      llmProvider: "groq",
      llmModel: "llama3",
    });
    expect(result.llmApiKey).toBe("gsk-xxx");
  });

  it("maps openrouter provider to OPENROUTER_API_KEY env var", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "or-xxx");
    const result = await resolveOptions({
      llmProvider: "openrouter",
      llmModel: "meta-llama/llama-3",
    });
    expect(result.llmApiKey).toBe("or-xxx");
  });

  it("maps gemini provider to GEMINI_API_KEY env var", async () => {
    vi.stubEnv("GEMINI_API_KEY", "gem-xxx");
    const result = await resolveOptions({
      llmProvider: "gemini",
      llmModel: "gemini-pro",
    });
    expect(result.llmApiKey).toBe("gem-xxx");
  });

  it("maps grok provider to GROK_API_KEY env var", async () => {
    vi.stubEnv("GROK_API_KEY", "xai-xxx");
    const result = await resolveOptions({
      llmProvider: "grok",
      llmModel: "grok-1",
    });
    expect(result.llmApiKey).toBe("xai-xxx");
  });

  it("uses defaults for language, timezone, and dataDir", async () => {
    const result = await resolveOptions({
      llmProvider: "openai",
      llmApiKey: "sk-xxx",
      llmModel: "gpt-4o",
    });
    expect(result.language).toBe("en");
    expect(result.timezone).toBe("UTC");
    expect(result.dataDir).toBe("./data");
  });

  it("CLI args take precedence over env", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-env");
    vi.stubEnv("LLM_MODEL", "env-model");
    const result = await resolveOptions({
      llmProvider: "openai",
      llmApiKey: "sk-cli",
      llmModel: "cli-model",
    });
    expect(result.llmApiKey).toBe("sk-cli");
    expect(result.llmModel).toBe("cli-model");
  });
});
