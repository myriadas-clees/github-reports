---
name: review-ci-triage
description: Triage PR review feedback, unresolved threads, or failed CI checks; determine whether feedback needs a code change and fix branch-caused defects.
---

# Review and CI triage

Apply the repository's `AGENTS.md` and any nearer instructions.

1. Start from the exact failing check or actionable review thread. Inspect its diff and directly implicated files. Treat failure as evidence to investigate, not proof that a suggested fix is correct.
2. Use `explorer` for focused repository evidence when needed. Classify the feedback:
   - **Legitimate defect:** violates a requirement, contract, testable invariant, security property, or established repository pattern.
   - **Intended behavior:** matches documented requirements, compatibility behavior, or a settled design decision.
   - **Benign/non-actionable:** style preference, speculative hardening, incorrect premise, duplicate or stale feedback, or work outside PR scope.
   - **Uncertain:** repository evidence supports multiple plausible product or architecture intentions.
3. Fix legitimate defects with the smallest targeted patch. Preserve intended behavior. Prepare concise, evidence-backed responses for benign or non-actionable feedback.
4. If reasonable investigation still leaves product or architecture intent uncertain, ask the user before changing behavior or replying conclusively.
5. Keep follow-up fixes on the same branch and PR. Re-run only directly affected checks unless broader validation is justified.
6. If triage becomes architecturally ambiguous or delegated analysis stalls, review existing evidence and take over directly instead of repeatedly delegating.
