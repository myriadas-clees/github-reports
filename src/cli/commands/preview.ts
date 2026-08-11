// preview command: local static server for output/ with optional watch + re-render

import { Command } from "commander";
import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { watch, type FSWatcher } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { parseLocalDate } from "../../collector/date-range.js";
import { loadConfigFile, resolveConfig } from "../../config.js";
import type { Language, Theme } from "../../types.js";
import { AVAILABLE_THEMES } from "../../renderer/themes/index.js";
import { runRender, type RenderCommandOptions } from "./render.js";

const env = (key: string): string | undefined => process.env[key];
const __dirname = dirname(fileURLToPath(import.meta.url));
const themesDir = resolve(__dirname, "../../../src/renderer/themes");

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export const mimeTypeForPath = (filePath: string): string =>
  MIME_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream";

/** Resolve a URL path under rootDir; returns null if it escapes the root. */
export const resolveSafePath = (rootDir: string, urlPath: string): string | null => {
  const decoded = decodeURIComponent((urlPath.split("?")[0] ?? urlPath).split("#")[0] ?? urlPath);
  const cleaned = decoded.replace(/^\/+/, "");
  const root = resolve(rootDir);
  const candidate = resolve(root, cleaned);
  const rel = relative(root, candidate);
  if (rel.startsWith("..") || rel === ".." || (rel !== "" && !candidate.startsWith(root + sep))) {
    return null;
  }
  return candidate;
};

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

export const handleStaticRequest = async (
  rootDir: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    res.end("Method Not Allowed");
    return;
  }

  const urlPath = req.url ?? "/";
  let filePath = resolveSafePath(rootDir, urlPath);
  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    let st = await stat(filePath);
    if (st.isDirectory()) {
      filePath = join(filePath, "index.html");
      st = await stat(filePath);
    }
    const body = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": mimeTypeForPath(filePath),
      "Content-Length": body.length,
      "Cache-Control": "no-store",
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  }
};

export const createStaticServer = (rootDir: string): Server =>
  createServer((req, res) => {
    void handleStaticRequest(rootDir, req, res);
  });

export const openBrowser = (url: string): void => {
  const platform = process.platform;
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
};

export const debounce = <T extends (...args: never[]) => void>(fn: T, ms: number): T => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return ((...args: never[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
};

type PreviewOptions = {
  port: number;
  outputDir: string;
  dataDir: string;
  baseUrl: string;
  siteTitle?: string;
  language: Language;
  timezone: string;
  theme: Theme;
  date?: Date;
  watch: boolean;
  open: boolean;
};

const watchPaths = (paths: string[], onChange: () => void): FSWatcher[] => {
  const watchers: FSWatcher[] = [];
  for (const p of paths) {
    try {
      const w = watch(p, { recursive: true }, () => onChange());
      watchers.push(w);
    } catch (err) {
      console.warn(`Could not watch ${p}:`, err instanceof Error ? err.message : err);
    }
  }
  return watchers;
};

export const startPreview = async (options: PreviewOptions): Promise<Server> => {
  const outputDir = resolve(options.outputDir);
  const dataDir = resolve(options.dataDir);
  const renderOpts: RenderCommandOptions = {
    dataDir,
    outputDir,
    baseUrl: options.baseUrl,
    siteTitle: options.siteTitle,
    language: options.language,
    timezone: options.timezone,
    theme: options.theme,
    date: options.date,
  };

  console.log("Rendering site for preview...");
  try {
    await runRender(renderOpts);
  } catch (err) {
    const hasIndex = await fileExists(join(outputDir, "index.html"));
    if (!hasIndex) {
      const message =
        `${err instanceof Error ? err.message : String(err)}\n` +
        `No site found in ${outputDir}. Run 'bun run report' first, then retry preview.`;
      throw new Error(message, { cause: err });
    }
    console.warn("Initial render failed; serving existing output:", err instanceof Error ? err.message : err);
  }

  const server = createStaticServer(outputDir);
  await new Promise<void>((resolveListen, reject) => {
    server.listen(options.port, "127.0.0.1", () => resolveListen());
    server.on("error", reject);
  });

  const url = `http://127.0.0.1:${options.port}/`;
  console.log(`Preview server at ${url}`);
  console.log(`Serving ${outputDir}`);

  if (options.watch) {
    let rendering = false;
    let pending = false;
    const doRender = async (): Promise<void> => {
      if (rendering) {
        pending = true;
        return;
      }
      rendering = true;
      try {
        console.log("Change detected — re-rendering...");
        await runRender(renderOpts);
        console.log("Re-render complete. Refresh the browser.");
      } catch (err) {
        console.error("Re-render failed:", err instanceof Error ? err.message : err);
      } finally {
        rendering = false;
        if (pending) {
          pending = false;
          void doRender();
        }
      }
    };
    const onChange = debounce(() => {
      void doRender();
    }, 200);

    const targets = [themesDir, dataDir].filter(Boolean);
    const watchers = watchPaths(targets, onChange);
    console.log(`Watching themes + data for changes (${targets.join(", ")})`);

    const shutdown = (): void => {
      for (const w of watchers) w.close();
      server.close();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }

  if (options.open) {
    openBrowser(url);
  }

  return server;
};

export const registerPreview = (program: Command): void => {
  program
    .command("preview")
    .description("Serve output/ locally and re-render when themes or data change")
    .option("--port <number>", "Port to listen on (default: 4173)", "4173")
    .option("--data-dir <dir>", "Data directory (env: DATA_DIR, default: ./data)")
    .option("-o, --output-dir <dir>", "HTML output directory (env: OUTPUT_DIR, default: ./output)")
    .option("--base-url <url>", "Base URL for links (default: http://127.0.0.1:<port>)")
    .option("--site-title <title>", "Site title (env: SITE_TITLE)")
    .option("--language <lang>", "Report language (env: LANGUAGE, default: en)")
    .option("--timezone <tz>", "IANA timezone (env: TIMEZONE, default: UTC)")
    .option("--theme <name>", `Theme: ${AVAILABLE_THEMES.join(", ")} (env: THEME)`)
    .option("--date <date>", "Report date (YYYY-MM-DD, default: previous workday)")
    .option("--config <path>", "Path to config.yaml (env: CONFIG_PATH)")
    .option("--no-open", "Do not open the browser")
    .option("--no-watch", "Serve only; do not watch or re-render on changes")
    .action(async (opts) => {
      try {
        const port = Number.parseInt(String(opts.port), 10);
        if (!Number.isFinite(port) || port < 1 || port > 65535) {
          throw new Error(`Invalid port: ${opts.port}`);
        }

        const fileCfg = await loadConfigFile(opts.config ?? env("CONFIG_PATH"));
        const cfg = resolveConfig(fileCfg, {
          username: env("GITHUB_USERNAME"),
          timezone: opts.timezone ?? env("TIMEZONE"),
          language: opts.language ?? env("LANGUAGE"),
          theme: opts.theme ?? env("THEME"),
          siteTitle: opts.siteTitle ?? env("SITE_TITLE"),
          dataDir: opts.dataDir ?? env("DATA_DIR"),
          outputDir: opts.outputDir ?? env("OUTPUT_DIR"),
        });

        const theme = cfg.theme;
        if (!AVAILABLE_THEMES.includes(theme)) {
          throw new Error(`Unknown theme "${theme}". Available: ${AVAILABLE_THEMES.join(", ")}`);
        }

        const baseUrl =
          opts.baseUrl ??
          env("BASE_URL") ??
          `http://127.0.0.1:${port}`;

        await startPreview({
          port,
          dataDir: opts.dataDir ?? cfg.dataDir,
          outputDir: opts.outputDir ?? cfg.outputDir,
          baseUrl,
          siteTitle: opts.siteTitle ?? env("SITE_TITLE") ?? cfg.siteTitle,
          language: (opts.language ?? cfg.language) as Language,
          timezone: opts.timezone ?? cfg.timezone,
          theme,
          date: opts.date ? parseLocalDate(opts.date, opts.timezone ?? cfg.timezone) : undefined,
          watch: opts.watch !== false,
          open: opts.open !== false,
        });
      } catch (error) {
        console.error("Error:", error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });
};
