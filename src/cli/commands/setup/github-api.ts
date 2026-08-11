// GitHub API helpers and repository management

// ── GitHub API helpers ───────────────────────────────────────

type GitHubHeaders = Record<string, string>;

const ghHeaders = (token: string): GitHubHeaders => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
});

const ghFetch = async (
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> =>
  fetch(`https://api.github.com${path}`, {
    method,
    headers: ghHeaders(token),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

export const ghGet = (token: string, path: string) => ghFetch(token, "GET", path);
export const ghPost = (token: string, path: string, body: unknown) => ghFetch(token, "POST", path, body);
export const ghPut = (token: string, path: string, body: unknown) => ghFetch(token, "PUT", path, body);
export const ghPatch = (token: string, path: string, body: unknown) => ghFetch(token, "PATCH", path, body);

// ── Token validation ─────────────────────────────────────────

export const validateToken = async (
  token: string,
): Promise<{ login: string; tokenType: "classic" | "fine-grained" }> => {
  const res = await ghGet(token, "/user");
  if (res.status === 401) {
    throw new Error(
      "Invalid or expired token.\n\n" +
        "  Create a token at: https://github.com/settings/tokens\n\n" +
        "  Classic PAT scopes needed: repo, workflow\n" +
        "  Fine-grained PAT:\n" +
        "    Repository access: All repositories\n" +
        "    Permissions: Actions, Administration, Contents,\n" +
        "                 Pages, Secrets, Workflows (all Read & Write)",
    );
  }
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);

  const { login } = (await res.json()) as { login: string };
  const scopeHeader = res.headers.get("x-oauth-scopes");

  // Fine-grained tokens do not return x-oauth-scopes header.
  // We cannot validate permissions upfront, so we validate lazily
  // when each API call is made and provide clear error messages.
  if (scopeHeader === null) {
    return { login, tokenType: "fine-grained" };
  }

  // Classic PAT: validate scopes
  const scopes = scopeHeader.split(",").map((s) => s.trim());
  const missing = ["repo", "workflow"].filter((s) => !scopes.includes(s));
  if (missing.length > 0) {
    throw new Error(
      `Token is missing required scopes: ${missing.join(", ")}\n\n` +
        "  Create a new token at: https://github.com/settings/tokens/new?scopes=repo,workflow\n" +
        "  Required scopes: repo, workflow",
    );
  }

  return { login, tokenType: "classic" };
};

// ── Secret encryption (sealed box via libsodium) ────────────

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const setRepoSecret = async (
  token: string,
  repo: string,
  name: string,
  value: string,
): Promise<boolean> => {
  const { default: _sodium } = await import("libsodium-wrappers");
  await _sodium.ready;

  // Retry up to 3 times with backoff (new repos may need time to propagate)
  for (let attempt = 0; attempt < 3; attempt++) {
    const keyRes = await ghGet(token, `/repos/${repo}/actions/secrets/public-key`);
    if (!keyRes.ok) {
      if (attempt < 2) {
        await sleep(3000 * (attempt + 1));
        continue;
      }
      return false;
    }

    const { key, key_id } = (await keyRes.json()) as {
      key: string;
      key_id: string;
    };
    const keyBytes = _sodium.from_base64(key, _sodium.base64_variants.ORIGINAL);
    const encrypted = _sodium.crypto_box_seal(new TextEncoder().encode(value), keyBytes);
    const encryptedB64 = _sodium.to_base64(encrypted, _sodium.base64_variants.ORIGINAL);

    const res = await ghPut(token, `/repos/${repo}/actions/secrets/${name}`, {
      encrypted_value: encryptedB64,
      key_id,
    });
    if (res.ok) return true;

    const body = await res.text().catch(() => "");
    console.log(`      Attempt ${attempt + 1}/3 failed: ${res.status} ${body.slice(0, 200)}`);

    if (attempt < 2) {
      await sleep(3000 * (attempt + 1));
      continue;
    }
    return false;
  }
  return false;
};

// ── Repository management ────────────────────────────────────

export const ensureRepo = async (
  token: string,
  fullRepo: string,
): Promise<boolean> => {
  const res = await ghGet(token, `/repos/${fullRepo}`);
  if (res.ok) {
    const existing = await res.json().catch(() => null) as { private?: boolean } | null;
    if (existing?.private === false) {
      const updateRes = await ghPatch(token, `/repos/${fullRepo}`, { private: true });
      if (!updateRes.ok) {
        throw new Error(`Failed to make existing repository ${fullRepo} private: ${updateRes.status}`);
      }
    }
    return false;
  }

  const [owner, name] = fullRepo.split("/");
  const { login } = (await (await ghGet(token, "/user")).json()) as {
    login: string;
  };

  const homepage = `https://${owner}.github.io/${name}`;
  const body = {
    name,
    auto_init: true,
    private: true,
    description: "Public daily activity reports sourced from private repositories",
    homepage,
  };

  const createRes =
    owner === login
      ? await ghPost(token, "/user/repos", body)
      : await ghPost(token, `/orgs/${owner}/repos`, body);

  if (!createRes.ok) {
    const errBody = await createRes.text();
    throw new Error(
      `Failed to create ${fullRepo}: ${createRes.status}\n  ${errBody}`,
    );
  }

  // Wait for repo to be ready
  await new Promise((r) => setTimeout(r, 2000));
  return true;
};

const REPO_TOPICS = [
  "github-weekly-reporter",
  "daily-report",
  "github-activity",
  "github-pages",
];

export const setRepoTopics = async (
  token: string,
  repo: string,
): Promise<void> => {
  await ghPut(token, `/repos/${repo}/topics`, { names: REPO_TOPICS });
};

export const addFileToRepo = async (
  token: string,
  repo: string,
  path: string,
  content: string,
  message: string,
): Promise<void> => {
  const existing = await ghGet(token, `/repos/${repo}/contents/${path}`);
  const sha = existing.ok
    ? ((await existing.json()) as { sha: string }).sha
    : undefined;

  const res = await ghPut(token, `/repos/${repo}/contents/${path}`, {
    message,
    content: btoa(unescape(encodeURIComponent(content))),
    ...(sha ? { sha } : {}),
  });
  if (!res.ok) {
    const hint = res.status === 403
      ? "\n\n  Possible causes:" +
        "\n    - Fine-grained PAT: ensure 'Contents: Read and write' and 'Workflows: Read and write' permissions" +
        "\n    - Classic PAT: ensure 'repo' and 'workflow' scopes are granted"
      : "";
    throw new Error(`Failed to add ${path}: ${res.status}${hint}`);
  }
};

export const enablePages = async (
  token: string,
  repo: string,
): Promise<string> => {
  // Pages requires its configured source branch to exist. Seed an orphan branch
  // with a harmless placeholder; the first deployment replaces its contents.
  const branchRes = await ghGet(token, `/repos/${repo}/git/ref/heads/gh-pages`);
  if (!branchRes.ok) {
    if (branchRes.status !== 404) {
      throw new Error(`Failed to inspect the gh-pages branch for ${repo}: ${branchRes.status}`);
    }
    const blobRes = await ghPost(token, `/repos/${repo}/git/blobs`, {
      content: "<!doctype html><title>Report setup in progress</title>",
      encoding: "utf-8",
    });
    if (!blobRes.ok) throw new Error(`Failed to create Pages placeholder: ${blobRes.status}`);
    const { sha: blobSha } = await blobRes.json() as { sha: string };
    const treeRes = await ghPost(token, `/repos/${repo}/git/trees`, {
      tree: [{ path: "index.html", mode: "100644", type: "blob", sha: blobSha }],
    });
    if (!treeRes.ok) throw new Error(`Failed to create Pages tree: ${treeRes.status}`);
    const { sha: treeSha } = await treeRes.json() as { sha: string };
    const commitRes = await ghPost(token, `/repos/${repo}/git/commits`, {
      message: "chore: initialize report site",
      tree: treeSha,
      parents: [],
    });
    if (!commitRes.ok) throw new Error(`Failed to create Pages commit: ${commitRes.status}`);
    const { sha: commitSha } = await commitRes.json() as { sha: string };
    const refRes = await ghPost(token, `/repos/${repo}/git/refs`, {
      ref: "refs/heads/gh-pages",
      sha: commitSha,
    });
    if (!refRes.ok) throw new Error(`Failed to create gh-pages branch: ${refRes.status}`);
  }

  const createRes = await ghPost(token, `/repos/${repo}/pages`, {
    source: { branch: "gh-pages", path: "/" },
  });
  if (!createRes.ok && createRes.status !== 409) {
    throw new Error(`Failed to enable Pages for ${repo}: ${createRes.status}`);
  }

  const pagesRes = await ghGet(token, `/repos/${repo}/pages`);
  const pages = pagesRes.ok
    ? await pagesRes.json().catch(() => null) as { html_url?: string } | null
    : null;

  const [owner, name] = repo.split("/");
  return pages?.html_url ?? `https://${owner}.github.io/${name}`;
};
