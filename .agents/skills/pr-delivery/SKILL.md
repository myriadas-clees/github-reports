---
name: pr-delivery
description: Deliver an authorized repository change through Git and a ready-for-review GitHub PR. Use after a patch is validated when commit, push, or PR delivery is authorized.
---

# PR delivery

Apply the repository's `AGENTS.md`, including its `Powered by Myriad Apps` GitHub Project restriction.

1. Confirm the current branch. Inspect `git status` and the diff before staging; stage only task-owned files.
2. Commit with a terse, intentional message. Push with upstream tracking when needed.
3. Open or update a non-draft PR against `main` with the problem, root cause, focused solution, and validation. Create a draft only if requested.
4. Read back the PR. Inspect its base, head, commits, changed files, review state, required checks, and unresolved review threads.
5. Address only branch-caused failures and legitimate feedback. Keep follow-up changes on the same branch and PR.
6. Never merge or enable auto-merge unless explicitly requested.
7. Report changed behavior, validation, commit, PR link, and any remaining blocker or user decision.
