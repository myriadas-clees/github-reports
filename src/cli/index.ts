#!/usr/bin/env node

// CLI entrypoint

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { Command } from "commander";
import { registerFetch } from "./commands/fetch.js";
import { registerGenerate } from "./commands/generate.js";
import { registerRender } from "./commands/render.js";
import { registerDeploy } from "./commands/deploy.js";
import { registerSetup } from "./commands/setup.js";
import { registerReport } from "./commands/report.js";
import { registerPreview } from "./commands/preview.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(__dirname, "..", "..", "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version: string };

const program = new Command()
  .name("worklog")
  .description("Private self-hosted weekly GitHub status-page generator (Thu–Wed)")
  .version(pkg.version);

registerFetch(program);
registerGenerate(program);
registerRender(program);
registerDeploy(program);
registerSetup(program);
registerReport(program);
registerPreview(program);

program.parse();
