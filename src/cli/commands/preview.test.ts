import { describe, it, expect, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Server } from "node:http";
import {
  mimeTypeForPath,
  resolveSafePath,
  createStaticServer,
  debounce,
} from "./preview.js";

describe("mimeTypeForPath", () => {
  it("maps common extensions", () => {
    expect(mimeTypeForPath("index.html")).toBe("text/html; charset=utf-8");
    expect(mimeTypeForPath("og.png")).toBe("image/png");
    expect(mimeTypeForPath("card.svg")).toBe("image/svg+xml");
    expect(mimeTypeForPath("feed.xml")).toBe("application/xml");
    expect(mimeTypeForPath("robots.txt")).toBe("text/plain; charset=utf-8");
  });

  it("falls back for unknown extensions", () => {
    expect(mimeTypeForPath("file.xyz")).toBe("application/octet-stream");
  });
});

describe("resolveSafePath", () => {
  const root = "/tmp/worklog-preview-root";

  it("resolves paths under the root", () => {
    expect(resolveSafePath(root, "/")).toBe(root);
    expect(resolveSafePath(root, "/index.html")).toBe(join(root, "index.html"));
    expect(resolveSafePath(root, "/2026/W14/")).toBe(join(root, "2026/W14"));
  });

  it("rejects path traversal", () => {
    expect(resolveSafePath(root, "/../etc/passwd")).toBeNull();
    expect(resolveSafePath(root, "/foo/../../etc/passwd")).toBeNull();
  });

  it("strips query and hash", () => {
    expect(resolveSafePath(root, "/index.html?x=1#y")).toBe(join(root, "index.html"));
  });
});

describe("debounce", () => {
  it("coalesces rapid calls", async () => {
    let count = 0;
    const fn = debounce(() => {
      count += 1;
    }, 50);
    fn();
    fn();
    fn();
    expect(count).toBe(0);
    await new Promise((r) => setTimeout(r, 80));
    expect(count).toBe(1);
  });
});

describe("createStaticServer", () => {
  let server: Server | undefined;
  let root: string;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("serves index.html for / and returns 404 for missing files", async () => {
    root = join(tmpdir(), `worklog-preview-${Date.now()}`);
    await mkdir(root, { recursive: true });
    await writeFile(join(root, "index.html"), "<h1>ok</h1>", "utf-8");
    await mkdir(join(root, "2026", "W14"), { recursive: true });
    await writeFile(join(root, "2026", "W14", "index.html"), "<p>week</p>", "utf-8");

    server = createStaticServer(root);
    await new Promise<void>((resolve, reject) => {
      server!.listen(0, "127.0.0.1", () => resolve());
      server!.on("error", reject);
    });
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("expected TCP address");
    const base = `http://127.0.0.1:${addr.port}`;

    const home = await fetch(`${base}/`);
    expect(home.status).toBe(200);
    expect(home.headers.get("content-type")).toContain("text/html");
    expect(await home.text()).toBe("<h1>ok</h1>");

    const week = await fetch(`${base}/2026/W14/`);
    expect(week.status).toBe(200);
    expect(await week.text()).toBe("<p>week</p>");

    const missing = await fetch(`${base}/nope.html`);
    expect(missing.status).toBe(404);
  });
});
