pub mod daily;
pub mod rollup;

use regex::Regex;
use std::sync::OnceLock;

pub(crate) fn locale_compare(a: &str, b: &str) -> std::cmp::Ordering {
    static COLLATOR: OnceLock<icu_collator::CollatorBorrowed<'static>> = OnceLock::new();
    COLLATOR
        .get_or_init(|| {
            icu_collator::Collator::try_new(Default::default(), Default::default())
                .expect("compiled ICU collation data")
        })
        .compare(a, b)
}

fn pattern(pattern: &'static str, cell: &'static OnceLock<Regex>) -> &'static Regex {
    cell.get_or_init(|| Regex::new(pattern).unwrap())
}

/// Port of classifyWorkType; keep precedence in sync with allocation.ts.
pub fn classify_work_type(text: &str, labels: &[String]) -> &'static str {
    static PREFIX: OnceLock<Regex> = OnceLock::new();
    static QUALITY: OnceLock<Regex> = OnceLock::new();
    static DOCS: OnceLock<Regex> = OnceLock::new();
    static MAINTENANCE: OnceLock<Regex> = OnceLock::new();
    static FEATURE: OnceLock<Regex> = OnceLock::new();
    let prefix = pattern(r"(?i)^\s*([a-z]+)(?:\([^)]*\))?!?:", &PREFIX)
        .captures(text)
        .map(|c| c[1].to_ascii_lowercase());
    match prefix.as_deref() {
        Some("feat" | "feature") => return "new-capability",
        Some("fix" | "perf" | "revert" | "test" | "tests") => return "quality",
        Some("refactor" | "chore" | "ci" | "build" | "style" | "deps") => return "maintenance",
        Some("docs") => return "documentation",
        _ => {}
    }
    if pattern(
        r"(?i-u)\b(fix(es|ed)?|bugs?|errors?|crash(es|ed)?|broken|regressions?)\b",
        &QUALITY,
    )
    .is_match(text)
    {
        return "quality";
    }
    if pattern(r"(?i-u)\b(docs?|readme|documentation)\b", &DOCS).is_match(text) {
        return "documentation";
    }
    if pattern(
        r"(?i-u)\b(bump|upgrade|refactor|clean ?up|ci|dependabot|deps|workflow)\b",
        &MAINTENANCE,
    )
    .is_match(text)
    {
        return "maintenance";
    }
    let labels: Vec<_> = labels
        .iter()
        .map(|s| s.trim().to_ascii_lowercase())
        .collect();
    if labels.iter().any(|s| s == "bug") {
        return "quality";
    }
    if labels.iter().any(|s| s == "documentation")
        && !pattern(
            r"(?i-u)\b(add|new|implement|introduce|build|create|redesign)\b",
            &FEATURE,
        )
        .is_match(text)
    {
        return "documentation";
    }
    if labels
        .iter()
        .any(|s| ["dependencies", "chore", "maintenance"].contains(&s.as_str()))
    {
        return "maintenance";
    }
    "new-capability"
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn precedence() {
        assert_eq!(
            classify_work_type("feat(ui)!: fix bug", &[]),
            "new-capability"
        );
        assert_eq!(classify_work_type("fix crash", &[]), "quality");
        assert_eq!(
            classify_work_type("add a page", &["documentation".into()]),
            "new-capability"
        );
        assert_eq!(
            classify_work_type("update guide", &[" Documentation ".into()]),
            "documentation"
        );
    }
}
