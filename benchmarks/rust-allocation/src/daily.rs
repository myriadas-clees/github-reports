use crate::classify_work_type;
use regex::Regex;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};

pub(crate) const NOTE: &str = "Work delivered is a modeled estimate of the manual engineering effort for one engineer to deliver the same changes without AI assistance, split across initiatives by delivered scope. It is not actual hours worked or measured time saved.";
fn s(v: &Value) -> &str {
    v.as_str().unwrap_or("")
}
fn n(v: &Value) -> f64 {
    v.as_f64().unwrap_or(0.0)
}
fn arr(v: &Value) -> &[Value] {
    v.as_array().map(Vec::as_slice).unwrap_or(&[])
}
fn strings(v: &Value) -> Vec<String> {
    arr(v).iter().map(|v| s(v).to_owned()).collect()
}
pub(crate) fn round1(v: f64) -> f64 {
    (v * 10.0 + 0.5).floor() / 10.0
}
fn conventional() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"(?i)^\s*([a-z]+)(?:\(([^)]*)\))?!?:").unwrap())
}
fn test_file(file: &str) -> bool {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"(?i)(^|/)(__tests__|tests?)(/|$)|\.(test|spec)\.[^/]+$").unwrap())
        .is_match(file)
}
fn humanize(input: &str) -> String {
    input
        .split(|c: char| c == '-' || c == '_' || c.is_whitespace())
        .filter(|x| !x.is_empty())
        .map(|x| {
            let mut chars = x.chars();
            chars.next().unwrap().to_uppercase().collect::<String>() + chars.as_str()
        })
        .collect::<Vec<_>>()
        .join(" ")
}
fn lookup<'a>(map: &'a Value, key: &str) -> Option<&'a str> {
    let obj = map.as_object()?;
    obj.get(key)
        .and_then(Value::as_str)
        .filter(|x| !x.is_empty())
        .or_else(|| {
            obj.iter()
                .find(|(k, _)| k.to_lowercase() == key.to_lowercase())
                .and_then(|(_, v)| v.as_str())
                .filter(|x| !x.is_empty())
        })
}
/// Resolve an initiative with the same precedence as the TypeScript classifier.
pub fn classify_initiative(
    title: &str,
    labels: &[String],
    repository: &str,
    config: &Value,
) -> String {
    let map = &config["initiatives"];
    let prefix = config
        .get("labelPrefix")
        .and_then(Value::as_str)
        .unwrap_or("app:")
        .to_lowercase();
    if !prefix.is_empty() {
        for label in labels {
            if label.to_lowercase().starts_with(&prefix) {
                if let Some(name) = lookup(map, label) {
                    return name.into();
                }
                // JavaScript's slice uses UTF-16 code units, including for non-ASCII prefixes.
                let suffix = String::from_utf16_lossy(
                    &label
                        .encode_utf16()
                        .skip(prefix.encode_utf16().count())
                        .collect::<Vec<_>>(),
                );
                if !suffix.trim().is_empty() {
                    return humanize(suffix.trim());
                }
            }
        }
    }
    for label in labels {
        if let Some(name) = lookup(map, label) {
            return name.into();
        }
    }
    if let Some(scope) = conventional()
        .captures(title)
        .and_then(|c| c.get(2).map(|m| m.as_str()))
    {
        for part in scope.split(',') {
            let key = format!("scope:{}", part.trim().to_lowercase());
            if let Some(name) = map
                .get(&key)
                .and_then(Value::as_str)
                .filter(|x| !x.is_empty())
            {
                return name.into();
            }
        }
    }
    if let Some(name) = lookup(map, &format!("repo:{repository}")) {
        return name.into();
    }
    if let Some(obj) = map.as_object() {
        // One benchmark process uses one small config; compile each configured name once.
        static NAMED_PATTERNS: OnceLock<Mutex<HashMap<String, Regex>>> = OnceLock::new();
        let mut patterns = NAMED_PATTERNS
            .get_or_init(|| Mutex::new(HashMap::new()))
            .lock()
            .unwrap();
        let mut names: Vec<&str> = obj.values().filter_map(Value::as_str).collect();
        names.sort_by_key(|b| std::cmp::Reverse(b.encode_utf16().count()));
        for name in names {
            let re = patterns.entry(name.to_owned()).or_insert_with(|| {
                Regex::new(&format!(r"(?i-u)\b{}\b", regex::escape(name))).unwrap()
            });
            if re.is_match(title) {
                return name.into();
            }
        }
    }
    if let Some(name) = config
        .get("defaultInitiative")
        .and_then(Value::as_str)
        .filter(|x| !x.is_empty())
    {
        return name.into();
    }
    let name = humanize(repository.rsplit('/').next().unwrap_or(repository));
    if name.is_empty() {
        "General engineering".into()
    } else {
        name
    }
}
fn pr_hours(add: f64, del: f64) -> f64 {
    let churn = add.max(0.0) + del.max(0.0);
    for (limit, hours) in [
        (50., 0.75),
        (150., 1.5),
        (400., 2.5),
        (1000., 4.),
        (2500., 6.),
        (6000., 9.),
        (15000., 13.),
        (30000., 18.),
    ] {
        if churn < limit {
            return hours;
        }
    }
    22.
}
fn daily_hours(add: f64, del: f64, files: f64, tests: bool, commits: usize) -> f64 {
    round1(
        1.5 + pr_hours(add, del)
            + ((files - 1.).max(0.) * 0.2).min(1.5)
            + if tests { 0.75 } else { 0. }
            + ((commits as f64 - 1.).max(0.) * 0.5).min(1.),
    )
}
fn pr_weight(pr: &Value) -> f64 {
    let commits = arr(&pr["workCommits"]).len();
    let add = n(&pr["workAdditions"]);
    let del = n(&pr["workDeletions"]);
    if commits == 0 && add + del <= 0. {
        return pr_hours(n(&pr["additions"]), n(&pr["deletions"]));
    }
    let files = strings(&pr["workFiles"]);
    daily_hours(
        add,
        del,
        files.len() as f64,
        files.iter().any(|f| test_file(f)),
        commits,
    )
}
pub(crate) fn impact(hours: f64, labels: &[String]) -> Option<&'static str> {
    static DOWN: OnceLock<Regex> = OnceLock::new();
    static UP: OnceLock<Regex> = OnceLock::new();
    let down = DOWN
        .get_or_init(|| Regex::new(r"(?i)^(impact|priority|severity)\s*:\s*(minor|low)$").unwrap());
    let up = UP.get_or_init(|| Regex::new(r"(?i)^(?:(?:impact|priority|severity)\s*:\s*(?:major|high|critical|p0|p1)|major|critical)$").unwrap());
    if labels.iter().any(|l| down.is_match(l.trim())) {
        None
    } else if labels.iter().any(|l| up.is_match(l.trim())) || hours >= 24. {
        Some("major")
    } else if hours >= 12. {
        Some("notable")
    } else {
        None
    }
}
#[derive(Default)]
struct Acc {
    name: String,
    hours: f64,
    types: Vec<(String, f64)>,
    shipped: Vec<Value>,
    progress: Vec<Value>,
    other: Vec<Value>,
}
fn acc<'a>(accs: &'a mut Vec<Acc>, name: &str) -> &'a mut Acc {
    let i = accs.iter().position(|a| a.name == name).unwrap_or_else(|| {
        accs.push(Acc {
            name: name.into(),
            ..Default::default()
        });
        accs.len() - 1
    });
    &mut accs[i]
}
fn add(accs: &mut Vec<Acc>, name: &str, typ: &str, hours: f64) {
    let a = acc(accs, name);
    a.hours += hours;
    if let Some((_, h)) = a.types.iter_mut().find(|(t, _)| t == typ) {
        *h += hours;
    } else {
        a.types.push((typ.into(), hours));
    }
}
pub(crate) fn label(t: &str) -> &str {
    match t {
        "new-capability" => "New capability",
        "quality" => "Quality & bug fixes",
        "maintenance" => "Maintenance & tooling",
        "documentation" => "Documentation",
        "team-support" => "Supporting the team",
        "unlogged" => "Meetings & unlogged (self-reported)",
        "no-activity" => "No GitHub activity",
        _ => "",
    }
}
fn date(v: &Value) -> String {
    s(v).chars().take(10).collect()
}

pub fn compute_allocation(data: &Value, config: &Value, manual: &[Value]) -> Value {
    let target = data
        .pointer("/hoursEstimate/hours")
        .and_then(Value::as_f64)
        .or_else(|| {
            data.pointer("/stats/estimatedHours")
                .and_then(Value::as_f64)
        })
        .unwrap_or(0.)
        .max(0.);
    let mut prs: Vec<&Value> = Vec::new();
    let mut urls = HashSet::new();
    let mut report_urls = HashSet::new();
    for key in ["pullRequests", "prsWorkedOnClosed"] {
        for pr in arr(&data[key]) {
            report_urls.insert(s(&pr["url"]).to_owned());
        }
    }
    for key in ["pullRequests", "prsInProgress", "prsWorkedOnClosed"] {
        for pr in arr(&data[key]) {
            if urls.insert(s(&pr["url"]).to_owned()) {
                prs.push(pr);
            }
        }
    }
    let mut entries: Vec<(String, String, f64)> = Vec::new();
    // Each placed PR carries its weight and labels until scaled effort is known.
    let mut placed: Vec<(String, &str, Value, Option<(f64, Vec<String>)>)> = Vec::new();
    let mut shas = HashSet::new();
    for pr in &prs {
        let title = s(&pr["title"]);
        let repo = s(&pr["repository"]);
        let url = s(&pr["url"]);
        let labels = strings(&pr["labels"]);
        let initiative = classify_initiative(title, &labels, repo, config);
        let counts = report_urls.contains(url)
            || !arr(&pr["workCommits"]).is_empty()
            || n(&pr["workAdditions"]) + n(&pr["workDeletions"]) > 0.;
        let weight = if counts { pr_weight(pr) } else { 0. };
        entries.push((
            initiative.clone(),
            classify_work_type(title, &labels).into(),
            weight,
        ));
        let state = if s(&pr["state"]) != "open" && !report_urls.contains(url) {
            "open"
        } else {
            s(&pr["state"])
        };
        let section = if state == "merged" {
            "shipped"
        } else if state == "open" {
            "inProgress"
        } else {
            "other"
        };
        let mut item =
            json!({"kind":"pr", "title":title, "url":url, "repository":repo, "state":state});
        if !labels.is_empty() {
            item["labels"] = json!(labels);
        }
        if !arr(&pr["workFiles"]).is_empty() {
            item["files"] = pr["workFiles"].clone();
        }
        placed.push((initiative, section, item, Some((weight, labels))));
        for commit in arr(&pr["workCommits"]) {
            shas.insert(s(&commit["sha"]).to_owned());
        }
    }
    let mut review_titles: HashMap<String, (String, String)> = HashMap::new();
    let mut reviewed = HashSet::new();
    let review_initiative = |repo: &str, title: &str, url: &str| {
        let labels = prs
            .iter()
            .find(|pr| s(&pr["url"]) == url)
            .map(|pr| strings(&pr["labels"]))
            .unwrap_or_default();
        classify_initiative(title, &labels, repo, config)
    };
    for review in arr(&data["codeReviews"]) {
        let repo = s(&review["repository"]);
        let title = s(&review["prTitle"]);
        let url = s(&review["prUrl"]);
        let initiative = review_initiative(repo, title, url);
        entries.push((initiative.clone(), "team-support".into(), 0.75));
        review_titles.insert(
            format!("{}#{}", repo, review["prNumber"]),
            (title.into(), url.into()),
        );
        if reviewed.insert(format!("{initiative}|{url}")) {
            placed.push((initiative,"other",json!({"kind":"review","title":format!("Reviewed: {title}"),"url":url,"repository":repo}),None));
        }
    }
    for comment in arr(&data["reviewComments"]) {
        let repo = s(&comment["repository"]);
        let number = &comment["prNumber"];
        let initiative = if let Some((title, url)) = review_titles.get(&format!("{repo}#{number}"))
        {
            review_initiative(repo, title, url)
        } else if let Some(pr) = prs.iter().find(|pr| {
            s(&pr["repository"]) == repo && s(&pr["url"]).ends_with(&format!("/pull/{number}"))
        }) {
            review_initiative(repo, s(&pr["title"]), s(&pr["url"]))
        } else {
            classify_initiative("", &[], repo, config)
        };
        entries.push((initiative, "team-support".into(), 0.25));
    }
    struct Commit {
        repo: String,
        message: String,
        add: f64,
        del: f64,
        files: f64,
        stats: bool,
        group: String,
    }
    let mut commits = Vec::<Commit>::new();
    let mut groups: Vec<(String, String, String, usize, Vec<String>)> = Vec::new();
    for repo in arr(&data["commitMessages"]) {
        let name = s(&repo["repo"]);
        let detail = arr(&repo["commits"]);
        let messages = arr(&repo["messages"]);
        let source = if detail.is_empty() { messages } else { detail };
        for c in source {
            let sha = s(&c["sha"]);
            if !sha.is_empty() && shas.contains(sha) {
                continue;
            }
            let message = if detail.is_empty() {
                s(c)
            } else {
                s(&c["message"])
            }
            .split('\n')
            .next()
            .unwrap_or("");
            let initiative = classify_initiative(message, &[], name, config);
            let typ = classify_work_type(message, &[]).to_owned();
            let key = format!("{initiative}|{typ}");
            if let Some(group) = groups.iter_mut().find(|g| g.0 == key) {
                group.3 += 1;
                if !group.4.iter().any(|r| r == name) {
                    group.4.push(name.into());
                }
            } else {
                groups.push((key.clone(), initiative, typ, 1, vec![name.into()]));
            }
            commits.push(Commit {
                repo: name.into(),
                message: message.into(),
                add: n(&c["additions"]),
                del: n(&c["deletions"]),
                files: n(&c["filesChanged"]),
                stats: !c["additions"].is_null() || !c["deletions"].is_null(),
                group: key,
            });
        }
    }
    let mut units: Vec<(String, Vec<usize>)> = Vec::new();
    for (i, c) in commits.iter().enumerate() {
        let caps = conventional().captures(&c.message);
        let unit = caps
            .as_ref()
            .and_then(|c| c.get(2))
            .map(|m| m.as_str().trim().to_lowercase())
            .filter(|s| !s.is_empty())
            .or_else(|| {
                caps.as_ref()
                    .and_then(|c| c.get(1))
                    .map(|m| m.as_str().to_lowercase())
            })
            .unwrap_or_else(|| "misc".into());
        let key = format!("{}|{}", c.repo, unit);
        if let Some((_, members)) = units.iter_mut().find(|(k, _)| k == &key) {
            members.push(i);
        } else {
            units.push((key, vec![i]));
        }
    }
    let mut weights: HashMap<String, f64> = HashMap::new();
    for (_, members) in units {
        let stats = members.iter().any(|&i| commits[i].stats);
        let hours = if stats {
            daily_hours(
                members.iter().map(|&i| commits[i].add).sum(),
                members.iter().map(|&i| commits[i].del).sum(),
                members.iter().map(|&i| commits[i].files).sum(),
                false,
                members.len(),
            )
        } else {
            (members.len() as f64 * 0.5).min(2.25)
        };
        for &i in &members {
            *weights.entry(commits[i].group.clone()).or_default() += hours / members.len() as f64;
        }
    }
    let mut counts: Vec<(String, usize, Vec<String>)> = Vec::new();
    for (key, initiative, typ, count, repos) in groups {
        entries.push((initiative.clone(), typ, *weights.get(&key).unwrap_or(&0.)));
        if let Some(tally) = counts.iter_mut().find(|t| t.0 == initiative) {
            tally.1 += count;
            for repo in repos {
                if !tally.2.contains(&repo) {
                    tally.2.push(repo);
                }
            }
        } else {
            counts.push((initiative, count, repos));
        }
    }
    for (initiative, count, repos) in counts {
        let mut item = json!({"kind":"commits","title":format!("{count} direct commit{}",if count == 1 {""} else {"s"})});
        if repos.len() == 1 {
            item["repository"] = json!(repos[0]);
        }
        placed.push((initiative, "other", item, None));
    }
    let mut accs = Vec::new();
    let weight_sum: f64 = entries.iter().map(|e| e.2).sum();
    if weight_sum > 0. {
        for (initiative, typ, weight) in entries {
            add(&mut accs, &initiative, &typ, weight / weight_sum * target);
        }
    } else if target > 0. {
        if n(&data["hoursEstimate"]["sessionHours"]) > 0. {
            add(
                &mut accs,
                config
                    .get("defaultInitiative")
                    .and_then(Value::as_str)
                    .unwrap_or("General engineering"),
                "maintenance",
                target,
            );
        } else {
            add(
                &mut accs,
                "No GitHub activity (minimum day)",
                "no-activity",
                target,
            );
        }
    }
    for (initiative, section, mut item, effort) in placed {
        if weight_sum > 0. {
            if let Some((weight, labels)) = effort {
                let hours = round1(weight / weight_sum * target);
                item["effortHours"] = json!(hours);
                if let Some(impact) = impact(hours, &labels) {
                    item["impact"] = json!(impact);
                }
            }
        }
        let a = acc(&mut accs, &initiative);
        match section {
            "shipped" => a.shipped.push(item),
            "inProgress" => a.progress.push(item),
            _ => a.other.push(item),
        }
    }
    let from = date(&data["dateRange"]["from"]);
    let to = date(&data["dateRange"]["to"]);
    let mut manual_hours = 0.;
    for entry in manual {
        let d = date(&entry["date"]);
        let hours = n(&entry["hours"]);
        if d < from || d > to || hours <= 0. {
            continue;
        }
        let initiative = s(&entry["initiative"]);
        let typ = entry
            .get("workType")
            .and_then(Value::as_str)
            .unwrap_or("unlogged");
        add(&mut accs, initiative, typ, hours);
        acc(&mut accs,initiative).other.push(json!({"kind":"manual","title":entry.get("note").and_then(Value::as_str).unwrap_or("Self-reported time")}));
        manual_hours += hours;
    }
    let total: f64 = accs.iter().map(|a| a.hours).sum();
    let mut type_totals: Vec<(String, f64)> = Vec::new();
    let mut buckets = Vec::new();
    for mut a in accs {
        let mut by_type = serde_json::Map::new();
        for (typ, hours) in a.types {
            if let Some((_, h)) = type_totals.iter_mut().find(|(t, _)| t == &typ) {
                *h += hours;
            } else {
                type_totals.push((typ.clone(), hours));
            }
            if round1(hours) > 0. {
                by_type.insert(typ, json!(round1(hours)));
            }
        }
        let sort = |items: &mut Vec<Value>| {
            items.sort_by(|a, b| {
                b.get("effortHours")
                    .and_then(Value::as_f64)
                    .unwrap_or(-1.)
                    .total_cmp(&a.get("effortHours").and_then(Value::as_f64).unwrap_or(-1.))
            })
        };
        sort(&mut a.shipped);
        sort(&mut a.progress);
        buckets.push(json!({"initiative":a.name,"hours":round1(a.hours),"share":if total > 0. {a.hours / total} else {0.},"byWorkType":by_type,"shipped":a.shipped,"inProgress":a.progress,"other":a.other}));
    }
    buckets.sort_by(|a, b| {
        n(&b["hours"])
            .total_cmp(&n(&a["hours"]))
            .then_with(|| crate::locale_compare(s(&a["initiative"]), s(&b["initiative"])))
    });
    let mut types: Vec<Value> = type_totals.into_iter().filter(|(_,h)| *h > 0.).map(|(t,h)| json!({"workType":t,"label":label(&t),"hours":round1(h),"share":if total>0. {h/total} else {0.}})).collect();
    types.sort_by(|a, b| {
        n(&b["hours"])
            .total_cmp(&n(&a["hours"]))
            .then_with(|| crate::locale_compare(s(&a["label"]), s(&b["label"])))
    });
    let mut result = json!({"version":"1.0","totalHours":round1(total),"initiatives":buckets,"workTypes":types,"manualHours":round1(manual_hours),"note":NOTE});
    if n(&data["aiReviews"]["fixed"]) > 0. {
        result["aiFindingsAddressed"] = data["aiReviews"]["fixed"].clone();
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn matches_typescript_combined_fixture() {
        // Captured from computeAllocation in allocation.ts.
        let fixture: Value = serde_json::from_str(r###"{"config":{"initiatives":{"app:alpha":"Alpha","scope:core":"Core","repo:org/extra":"Extra"},"labelPrefix":"app:","defaultInitiative":null,"trendWeeks":8},"data":{"dateRange":{"from":"2026-10-01","to":"2026-10-01"},"hoursEstimate":{"hours":20,"sessionHours":0},"pullRequests":[{"title":"feat: build","url":"https://x/pull/1","repository":"org/app","state":"merged","labels":["app:alpha","impact: low"],"workAdditions":100,"workFiles":["tests/a.ts","src/a.ts"],"workCommits":[{"sha":"same"},{"sha":"s2"}]}],"prsInProgress":[{"title":"duplicate","url":"https://x/pull/1","repository":"org/app","state":"open"},{"title":"chore: old","url":"https://x/pull/2","repository":"org/extra","state":"merged"}],"codeReviews":[{"repository":"org/app","prTitle":"feat: build","prUrl":"https://x/pull/1","prNumber":1},{"repository":"org/app","prTitle":"feat: build","prUrl":"https://x/pull/1","prNumber":1}],"reviewComments":[{"repository":"org/app","prNumber":1},{"repository":"org/extra","prNumber":3}],"commitMessages":[{"repo":"org/extra","commits":[{"sha":"same","message":"fix: duplicate"},{"sha":"a","message":"feat(core): add","additions":100,"filesChanged":2},{"sha":"b","message":"fix(core): fix","deletions":30}]},{"repo":"org/app","messages":["docs: update\nbody","docs: second"]}],"aiReviews":{"fixed":2}},"manual":[{"date":"2026-10-01T18:00:00Z","initiative":"Alpha","hours":1.25,"note":"Meeting"},{"date":"2026-10-02","initiative":"Ignore","hours":3}],"expected":{"version":"1.0","totalHours":21.3,"initiatives":[{"initiative":"Alpha","hours":12.4,"share":0.5840336134453781,"byWorkType":{"new-capability":8,"team-support":3.1,"unlogged":1.3},"shipped":[{"kind":"pr","title":"feat: build","url":"https://x/pull/1","repository":"org/app","state":"merged","labels":["app:alpha","impact: low"],"files":["tests/a.ts","src/a.ts"],"effortHours":8}],"inProgress":[],"other":[{"kind":"review","title":"Reviewed: feat: build","url":"https://x/pull/1","repository":"org/app"},{"kind":"manual","title":"Meeting"}]},{"initiative":"Core","hours":6.6,"share":0.31092436974789917,"byWorkType":{"new-capability":3.3,"quality":3.3},"shipped":[],"inProgress":[],"other":[{"kind":"commits","title":"2 direct commits","repository":"org/extra"}]},{"initiative":"App","hours":1.8,"share":0.08403361344537816,"byWorkType":{"documentation":1.8},"shipped":[],"inProgress":[],"other":[{"kind":"commits","title":"2 direct commits","repository":"org/app"}]},{"initiative":"Extra","hours":0.4,"share":0.02100840336134454,"byWorkType":{"team-support":0.4},"shipped":[],"inProgress":[{"kind":"pr","title":"chore: old","url":"https://x/pull/2","repository":"org/extra","state":"open","effortHours":0}],"other":[]}],"workTypes":[{"workType":"new-capability","label":"New capability","hours":11.3,"share":0.5336134453781514},{"workType":"team-support","label":"Supporting the team","hours":3.6,"share":0.16806722689075632},{"workType":"quality","label":"Quality & bug fixes","hours":3.3,"share":0.15546218487394958},{"workType":"documentation","label":"Documentation","hours":1.8,"share":0.08403361344537816},{"workType":"unlogged","label":"Meetings & unlogged (self-reported)","hours":1.3,"share":0.058823529411764705}],"manualHours":1.3,"aiFindingsAddressed":2,"note":"Work delivered is a modeled estimate of the manual engineering effort for one engineer to deliver the same changes without AI assistance, split across initiatives by delivered scope. It is not actual hours worked or measured time saved."}}"###).unwrap();
        fn numbers_as_floats(v: &mut Value) {
            match v {
                Value::Number(n) => *v = json!(n.as_f64().unwrap()),
                Value::Array(a) => a.iter_mut().for_each(numbers_as_floats),
                Value::Object(o) => o.values_mut().for_each(numbers_as_floats),
                _ => {}
            }
        }
        let mut actual = compute_allocation(
            &fixture["data"],
            &fixture["config"],
            arr(&fixture["manual"]),
        );
        let mut expected = fixture["expected"].clone();
        numbers_as_floats(&mut actual);
        numbers_as_floats(&mut expected);
        assert_eq!(actual, expected);
    }
    #[test]
    fn fallback_and_classification() {
        let config = json!({"initiatives":{"scope:api":"API", "repo:org/tool":"Tools", "app:tag":"Tagged"}, "labelPrefix":"app:", "defaultInitiative":"Default"});
        assert_eq!(
            classify_initiative("feat(api): work", &["APP:tag".into()], "org/tool", &config),
            "Tagged"
        );
        assert_eq!(
            classify_initiative("feat(api): work", &[], "org/tool", &config),
            "API"
        );
        assert_eq!(
            classify_initiative("work", &[], "org/tool", &config),
            "Tools"
        );
        assert_eq!(
            classify_initiative("work on Tools", &[], "other", &config),
            "Tools"
        );
        assert_eq!(
            classify_initiative("work", &["app:some_product".into()], "other", &config),
            "Some Product"
        );
        let min = compute_allocation(&json!({"stats":{"estimatedHours":2}}), &config, &[]);
        assert_eq!(
            min["initiatives"][0]["initiative"],
            "No GitHub activity (minimum day)"
        );
        let session = compute_allocation(
            &json!({"hoursEstimate":{"hours":2,"sessionHours":1}}),
            &config,
            &[],
        );
        assert_eq!(session["initiatives"][0]["initiative"], "Default");
        assert_eq!(session["workTypes"][0]["workType"], "maintenance");
    }
}
