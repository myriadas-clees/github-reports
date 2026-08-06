// Aggregate per-repository activity from PRs, issues, and commits

import type { PullRequest, Issue, RepositoryActivity, RepoCommitMessages } from "../types.js";

export const aggregateRepositories = (
  pullRequests: PullRequest[],
  issues: Issue[],
  commitMessages: RepoCommitMessages[] = [],
): RepositoryActivity[] => {
  const repoMap = new Map<string, RepositoryActivity>();

  const getOrCreate = (name: string): RepositoryActivity => {
    const existing = repoMap.get(name);
    if (existing) return existing;
    const repo: RepositoryActivity = {
      name,
      commits: 0,
      prsOpened: 0,
      prsMerged: 0,
      issuesOpened: 0,
      issuesClosed: 0,
      url: `https://github.com/${name}`,
    };
    repoMap.set(name, repo);
    return repo;
  };

  pullRequests.forEach((pr) => {
    const repo = getOrCreate(pr.repository);
    repo.prsOpened += 1;
    if (pr.state === "merged") repo.prsMerged += 1;
  });

  issues.forEach((issue) => {
    const repo = getOrCreate(issue.repository);
    repo.issuesOpened += 1;
    if (issue.state === "closed") repo.issuesClosed += 1;
  });

  commitMessages.forEach((cm) => {
    const repo = getOrCreate(cm.repo);
    repo.commits += cm.commits?.length ?? cm.messages.length;
  });

  return [...repoMap.values()].sort(
    (a, b) =>
      (b.prsOpened + b.issuesOpened + b.commits) -
      (a.prsOpened + a.issuesOpened + a.commits),
  );
};
