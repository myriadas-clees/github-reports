---
name: scoped-issue
description: Implement a bounded issue, feature, fix, or requested repository change from investigation through a validated patch. Use when asked to make a scoped repository change.
---

# Scoped issue

Apply the repository's `AGENTS.md` and any nearer instructions.

1. Read the request or issue, applicable instructions, current branch state, and existing PR context if any.
2. Identify what is unknown. For non-trivial repository discovery, give one read-only `explorer` a focused investigation.
3. Reuse its cited handoff. Inspect only targeted evidence needed to verify or resolve uncertainty; do not repeat broad discovery.
4. When implementation is sufficiently bounded, give one `worker` the relevant files, constraints, and explorer handoff. If the remaining work becomes ambiguous or reasoning-heavy, take over directly instead of repeatedly delegating.
5. Implement the smallest correct patch. Run narrow validation first and expand only when the affected surface or required checks justify it.
6. Review the final diff for scope, generated files, secrets, and unrelated changes.
7. If Git and PR delivery is authorized, follow the `pr-delivery` skill rather than duplicating that procedure here.
8. Stop when the scoped work is validated and ready for human review.
