//! Benchmark-only rollups of precomputed daily allocations.
use crate::{
    classify_work_type,
    daily::{compute_allocation, impact, label, round1, NOTE},
};
use serde_json::{json, Value};
use std::borrow::Borrow;
use std::borrow::Cow;
use std::collections::HashMap;
use std::rc::Rc;

fn s(v: &Value) -> &str {
    v.as_str().unwrap_or("")
}
fn n(v: &Value) -> f64 {
    v.as_f64().unwrap_or(0.)
}
fn arr(v: &Value) -> &[Value] {
    v.as_array().map(Vec::as_slice).unwrap_or(&[])
}
fn day(v: &Value) -> String {
    s(v).chars().take(10).collect()
}
fn strings(v: &Value) -> Vec<String> {
    arr(v).iter().map(|x| s(x).to_owned()).collect()
}
fn commit_count(title: &str) -> i64 {
    // Number.parseInt(title, 10) consumes the leading digits, even before other text.
    let title = title.trim_start();
    let len = title
        .char_indices()
        .take_while(|(i, c)| c.is_ascii_digit() || (*i == 0 && (*c == '+' || *c == '-')))
        .map(|(i, c)| i + c.len_utf8())
        .last()
        .unwrap_or(0);
    title[..len].parse().unwrap_or(0)
}

#[derive(Default)]
struct Bucket {
    name: String,
    hours: f64,
    types: Vec<(String, f64)>,
    items: [Vec<usize>; 3],
}
struct Item {
    value: Value,
    bucket: usize,
    section: usize,
    last: usize,
    active: bool,
}
fn bucket(buckets: &mut Vec<Bucket>, name: &str) -> usize {
    if let Some(i) = buckets.iter().position(|b| b.name == name) {
        i
    } else {
        buckets.push(Bucket {
            name: name.into(),
            ..Default::default()
        });
        buckets.len() - 1
    }
}
fn add_type(b: &mut Bucket, typ: &str, hours: f64) {
    if let Some((_, h)) = b.types.iter_mut().find(|(t, _)| t == typ) {
        *h += hours;
    } else {
        b.types.push((typ.into(), hours));
    }
}
fn absorb(target: &mut Value, other: &Value) {
    if !other["effortHours"].is_null() {
        target["effortHours"] = json!(round1(n(&target["effortHours"]) + n(&other["effortHours"])));
    }
    if s(&target["kind"]) != "pr" {
        return;
    }
    for field in ["files", "labels"] {
        if !arr(&other[field]).is_empty() {
            let mut values = arr(&target[field]).to_vec();
            for v in arr(&other[field]) {
                if !values.contains(v) {
                    values.push(v.clone());
                }
            }
            target[field] = json!(values);
        }
    }
    let labels = strings(&target["labels"]);
    let suppressed = labels.iter().any(|l| {
        let l = l.trim().to_lowercase();
        l.split_once(':').is_some_and(|(a, b)| {
            ["impact", "priority", "severity"].contains(&a.trim())
                && ["minor", "low"].contains(&b.trim())
        })
    });
    let derived = impact(n(&target["effortHours"]), &labels).unwrap_or("");
    let best = [s(&target["impact"]), s(&other["impact"]), derived]
        .into_iter()
        .max_by_key(|x| match *x {
            "major" => 2,
            "notable" => 1,
            _ => 0,
        })
        .unwrap_or("")
        .to_owned();
    if suppressed || best.is_empty() {
        target.as_object_mut().unwrap().remove("impact");
    } else {
        target["impact"] = json!(best);
    }
}
fn cmp_text(a: &str, b: &str) -> std::cmp::Ordering {
    crate::locale_compare(a, b)
}

/// Merge daily allocations in caller-provided chronological order.
pub fn merge_allocations<A: Borrow<Value>>(allocations: &[A]) -> Value {
    let mut buckets = Vec::<Bucket>::new();
    let mut items = Vec::<Item>::new();
    let mut manual = 0.;
    let mut ai = 0.;
    for (index, allocation) in allocations.iter().map(Borrow::borrow).enumerate() {
        manual += n(&allocation["manualHours"]);
        ai += n(&allocation["aiFindingsAddressed"]);
        for b in arr(&allocation["initiatives"]) {
            let bi = bucket(&mut buckets, s(&b["initiative"]));
            buckets[bi].hours += n(&b["hours"]);
            if let Some(types) = b["byWorkType"].as_object() {
                for (t, h) in types {
                    add_type(&mut buckets[bi], t, n(h));
                }
            }
            for (section, name) in ["shipped", "inProgress", "other"].iter().enumerate() {
                for item in arr(&b[*name]) {
                    let kind = s(&item["kind"]);
                    if kind == "commits" {
                        let count = commit_count(s(&item["title"]));
                        if let Some(i) = items
                            .iter()
                            .position(|x| x.bucket == bi && s(&x.value["kind"]) == "commits")
                        {
                            let old = commit_count(s(&items[i].value["title"]));
                            let sum = old + count;
                            items[i].value["title"] = json!(format!(
                                "{sum} direct commit{}",
                                if sum == 1 { "" } else { "s" }
                            ));
                            if items[i].value.get("repository") != item.get("repository") {
                                items[i].value.as_object_mut().unwrap().remove("repository");
                            }
                            continue;
                        }
                    } else if kind != "manual" {
                        let key = item
                            .get("url")
                            .filter(|v| !v.is_null())
                            .unwrap_or(&item["title"]);
                        if let Some(i) = items.iter().position(|x| {
                            x.bucket == bi
                                && x.section == section
                                && s(&x.value["kind"]) == kind
                                && x.value
                                    .get("url")
                                    .filter(|v| !v.is_null())
                                    .unwrap_or(&x.value["title"])
                                    == key
                        }) {
                            absorb(&mut items[i].value, item);
                            if section == 1
                                || (section == 2 && kind == "pr" && s(&item["state"]) == "closed")
                            {
                                items[i].last = index;
                            }
                            continue;
                        }
                    }
                    let mut copy = item.clone();
                    if kind == "commits" {
                        let count = commit_count(s(&item["title"]));
                        copy["title"] = json!(format!(
                            "{count} direct commit{}",
                            if count == 1 { "" } else { "s" }
                        ));
                    }
                    let i = items.len();
                    items.push(Item {
                        value: copy,
                        bucket: bi,
                        section,
                        last: index,
                        active: true,
                    });
                    buckets[bi].items[section].push(i);
                }
            }
        }
    }
    // Traverse in bucket/section insertion order, matching the TypeScript maps.
    let order: Vec<usize> = buckets
        .iter()
        .flat_map(|b| b.items.iter().flat_map(|x| x.iter().copied()))
        .collect();
    let mut urls = Vec::<String>::new();
    for &i in &order {
        let x = &items[i];
        let url = s(&x.value["url"]);
        if !url.is_empty()
            && (x.section == 1
                || (x.section == 2
                    && s(&x.value["kind"]) == "pr"
                    && s(&x.value["state"]) == "closed"))
            && !urls.iter().any(|u| u == url)
        {
            urls.push(url.into());
        }
    }
    for url in urls {
        let appearances: Vec<usize> = order
            .iter()
            .copied()
            .filter(|&i| {
                let x = &items[i];
                s(&x.value["url"]) == url
                    && (x.section == 1
                        || (x.section == 2
                            && s(&x.value["kind"]) == "pr"
                            && s(&x.value["state"]) == "closed"))
            })
            .collect();
        let shipped = order
            .iter()
            .copied()
            .find(|&i| items[i].section == 0 && s(&items[i].value["url"]) == url);
        let dest = shipped.unwrap_or_else(|| {
            *appearances
                .iter()
                .reduce(|a, b| {
                    if items[*b].last > items[*a].last {
                        b
                    } else {
                        a
                    }
                })
                .unwrap()
        });
        for i in appearances {
            if i == dest {
                continue;
            }
            let source = items[i].value.clone();
            let from = items[i].bucket;
            let to = items[dest].bucket;
            let from_type = classify_work_type(s(&source["title"]), &strings(&source["labels"]));
            let to_type = classify_work_type(
                s(&items[dest].value["title"]),
                &strings(&items[dest].value["labels"]),
            );
            let hours = n(&source["effortHours"]);
            absorb(&mut items[dest].value, &source);
            if from != to && hours != 0. {
                buckets[from].hours = (buckets[from].hours - hours).max(0.);
                let old = buckets[from]
                    .types
                    .iter()
                    .find(|(t, _)| t == from_type)
                    .map(|(_, h)| *h)
                    .unwrap_or(0.);
                add_type(&mut buckets[from], from_type, (old - hours).max(0.) - old);
                buckets[to].hours += hours;
                add_type(&mut buckets[to], to_type, hours);
            }
            items[i].active = false;
        }
    }
    buckets.retain(|b| b.items.iter().flatten().any(|&i| items[i].active) || b.hours > 0.000001);
    let total: f64 = buckets.iter().map(|b| b.hours).sum();
    let mut totals = Vec::<(String, f64)>::new();
    let mut result = Vec::new();
    for b in buckets {
        let mut by_type = serde_json::Map::new();
        for (t, h) in b.types {
            if let Some((_, v)) = totals.iter_mut().find(|(x, _)| x == &t) {
                *v += h;
            } else {
                totals.push((t.clone(), h));
            }
            if round1(h) > 0. {
                by_type.insert(t, json!(round1(h)));
            }
        }
        let section = |idx: usize| {
            let mut values: Vec<Value> = b.items[idx]
                .iter()
                .filter(|&&i| items[i].active)
                .map(|&i| items[i].value.clone())
                .collect();
            if idx < 2 {
                values.sort_by(|a, b| {
                    b.get("effortHours")
                        .and_then(Value::as_f64)
                        .unwrap_or(-1.)
                        .total_cmp(&a.get("effortHours").and_then(Value::as_f64).unwrap_or(-1.))
                });
            }
            values
        };
        result.push(json!({"initiative":b.name,"hours":round1(b.hours),"share":if total > 0. {b.hours/total} else {0.},"byWorkType":by_type,"shipped":section(0),"inProgress":section(1),"other":section(2)}));
    }
    result.sort_by(|a, b| {
        n(&b["hours"])
            .total_cmp(&n(&a["hours"]))
            .then_with(|| cmp_text(s(&a["initiative"]), s(&b["initiative"])))
    });
    let mut types: Vec<Value> = totals.into_iter().filter(|(_,h)| *h > 0.).map(|(t,h)| json!({"workType":t,"label":label(&t),"hours":round1(h),"share":if total > 0. {h/total} else {0.}})).collect();
    types.sort_by(|a, b| {
        n(&b["hours"])
            .total_cmp(&n(&a["hours"]))
            .then_with(|| cmp_text(s(&a["label"]), s(&b["label"])))
    });
    let mut value = json!({"version":"1.0","totalHours":round1(total),"initiatives":result,"workTypes":types,"manualHours":round1(manual),"note":NOTE});
    if ai > 0. {
        value["aiFindingsAddressed"] = json!(ai);
    }
    value
}

fn week_label(from: &str, to: &str) -> String {
    let parse = |d: &str| -> Option<(u32, usize, u32)> {
        let p: Vec<_> = d.split('-').collect();
        Some((
            p.first()?.parse().ok()?,
            p.get(1)?.parse().ok()?,
            p.get(2)?.parse().ok()?,
        ))
    };
    let months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    if let (Some((fy, fm, fd)), Some((ty, tm, td))) = (parse(from), parse(to)) {
        if let (Some(f), Some(t)) = (
            fm.checked_sub(1).and_then(|x| months.get(x)),
            tm.checked_sub(1).and_then(|x| months.get(x)),
        ) {
            return if from == to {
                format!("{f} {fd}")
            } else if fy == ty && fm == tm {
                format!("{f} {fd}-{td}")
            } else if fy == ty {
                format!("{f} {fd}-{t} {td}")
            } else {
                format!("{f} {fd}, {fy}-{t} {td}, {ty}")
            };
        }
    }
    format!("Week of {from}")
}

/// Reports are `{date, data: {dateRange}, allocation}`; each allocation must already
/// include manual entries covered by its report. Windows are ordered `{from, to}`
/// Thu–Wed ranges. `end_date` excludes future reports and manual entries.
pub fn build_allocation_trend(
    reports: &[Value],
    windows: &[Value],
    end_date: &str,
    config: &Value,
    manual: &[Value],
) -> Trend {
    build_allocation_trend_cached(
        reports,
        windows,
        end_date,
        config,
        manual,
        &mut HashMap::new(),
    )
}

/// The cache must be scoped to a batch with unchanged reports, config, and manual time.
pub fn build_allocation_trend_cached(
    reports: &[Value],
    windows: &[Value],
    end_date: &str,
    config: &Value,
    manual: &[Value],
    cache: &mut HashMap<(String, String, String), Rc<Value>>,
) -> Trend {
    let end: String = end_date.chars().take(10).collect();
    let mut periods = Vec::new();
    let mut totals = Vec::<(String, f64)>::new();
    for window in windows {
        let from = day(&window["from"]);
        let to = day(&window["to"]);
        let key = (from.clone(), to.clone(), std::cmp::min(&end, &to).clone());
        if let Some(period) = cache.get(&key) {
            for b in arr(&period["allocation"]["initiatives"]) {
                let name = s(&b["initiative"]);
                if let Some((_, h)) = totals.iter_mut().find(|(t, _)| t == name) {
                    *h += n(&b["hours"]);
                } else {
                    totals.push((name.into(), n(&b["hours"])));
                }
            }
            periods.push(Rc::clone(period));
            continue;
        }
        let in_week: Vec<&Value> = reports
            .iter()
            .filter(|r| {
                let d = day(&r["date"]);
                d >= from && d <= to && d <= end
            })
            .collect();
        let mut allocations: Vec<Cow<'_, Value>> = in_week
            .iter()
            .map(|report| Cow::Borrowed(&report["allocation"]))
            .collect();
        let extra: Vec<Value> = manual
            .iter()
            .filter(|e| {
                let d = day(&e["date"]);
                d >= from
                    && d <= to
                    && d <= end
                    && !in_week.iter().any(|r| {
                        day(&r["date"]) == d
                            || (day(&r["data"]["dateRange"]["from"]) <= d
                                && d <= day(&r["data"]["dateRange"]["to"]))
                    })
            })
            .cloned()
            .collect();
        if !extra.is_empty() {
            allocations.push(Cow::Owned(compute_allocation(
                &json!({"dateRange":{"from":from,"to":to},"stats":{"estimatedHours":0},"pullRequests":[],"commitMessages":[]}),
                config,
                &extra,
            )));
        }
        let allocation = merge_allocations(&allocations);
        for b in arr(&allocation["initiatives"]) {
            let name = s(&b["initiative"]);
            if let Some((_, h)) = totals.iter_mut().find(|(t, _)| t == name) {
                *h += n(&b["hours"]);
            } else {
                totals.push((name.into(), n(&b["hours"])));
            }
        }
        let period = json!({"id":from,"label":week_label(&from,&to),"from":from,"to":to,"days":in_week.len(),"allocation":allocation});
        let period = Rc::new(period);
        cache.insert(key, Rc::clone(&period));
        periods.push(period);
    }
    totals.sort_by(|a, b| b.1.total_cmp(&a.1).then_with(|| cmp_text(&a.0, &b.0)));
    Trend {
        initiatives: totals.into_iter().map(|(name, _)| name).collect(),
        periods,
    }
}

#[derive(serde::Serialize)]
pub struct Trend {
    pub initiatives: Vec<String>,
    pub periods: Vec<Rc<Value>>,
}

#[cfg(test)]
mod tests {
    use super::*;

    // Captured from computeAllocation, mergeAllocations and buildAllocationTrend.
    fn fixture() -> Value {
        serde_json::from_str(r###"{"config":{"initiatives":{},"labelPrefix":"app:","defaultInitiative":null,"trendWeeks":8},"manual":[{"date":"2026-10-07","initiative":"Ops","hours":1.25,"note":"sync"},{"date":"2026-10-04","initiative":"Ops","hours":3},{"date":"2026-09-26","initiative":"Ops","hours":1},{"date":"2026-10-09","initiative":"Future","hours":9}],"prepared":[{"date":"2026-10-01","data":{"dateRange":{"from":"2026-10-01","to":"2026-10-01"},"stats":{"estimatedHours":10},"pullRequests":[{"url":"p","state":"open","labels":["app: alpha","impact: low"],"title":"feat: hub","repository":"o/app","additions":10,"deletions":0,"workFiles":["a"]}],"commitMessages":[{"repo":"o/app","messages":["fix: first"]}],"aiReviews":{"fixed":2}},"allocation":{"version":"1.0","totalHours":10,"initiatives":[{"initiative":"Alpha","hours":6,"share":0.6,"byWorkType":{"new-capability":6},"shipped":[],"inProgress":[{"kind":"pr","title":"feat: hub","url":"p","repository":"o/app","state":"open","labels":["app: alpha","impact: low"],"files":["a"],"effortHours":6}],"other":[]},{"initiative":"App","hours":4,"share":0.4,"byWorkType":{"quality":4},"shipped":[],"inProgress":[],"other":[{"kind":"commits","title":"1 direct commit","repository":"o/app"}]}],"workTypes":[{"workType":"new-capability","label":"New capability","hours":6,"share":0.6},{"workType":"quality","label":"Quality & bug fixes","hours":4,"share":0.4}],"manualHours":0,"aiFindingsAddressed":2,"note":"Work delivered is a modeled estimate of the manual engineering effort for one engineer to deliver the same changes without AI assistance, split across initiatives by delivered scope. It is not actual hours worked or measured time saved."}},{"date":"2026-10-03","data":{"dateRange":{"from":"2026-10-03","to":"2026-10-03"},"stats":{"estimatedHours":6},"pullRequests":[{"url":"p","state":"open","labels":["app: beta"],"title":"fix: hub","repository":"o/app","additions":10,"deletions":0,"workFiles":["b"]}],"commitMessages":[{"repo":"o/app","messages":["fix: next"]}],"aiReviews":{"fixed":2}},"allocation":{"version":"1.0","totalHours":6,"initiatives":[{"initiative":"Beta","hours":3.6,"share":0.6,"byWorkType":{"quality":3.6},"shipped":[],"inProgress":[{"kind":"pr","title":"fix: hub","url":"p","repository":"o/app","state":"open","labels":["app: beta"],"files":["b"],"effortHours":3.6}],"other":[]},{"initiative":"App","hours":2.4,"share":0.4000000000000001,"byWorkType":{"quality":2.4},"shipped":[],"inProgress":[],"other":[{"kind":"commits","title":"1 direct commit","repository":"o/app"}]}],"workTypes":[{"workType":"quality","label":"Quality & bug fixes","hours":6,"share":1}],"manualHours":0,"aiFindingsAddressed":2,"note":"Work delivered is a modeled estimate of the manual engineering effort for one engineer to deliver the same changes without AI assistance, split across initiatives by delivered scope. It is not actual hours worked or measured time saved."}},{"date":"2026-10-07","data":{"dateRange":{"from":"2026-10-07","to":"2026-10-07"},"stats":{"estimatedHours":8},"pullRequests":[{"url":"p","state":"merged","labels":["app: gamma","impact: high"],"title":"fix: hub","repository":"o/app","additions":10,"deletions":0,"workFiles":["c"]},{"url":"q","state":"merged","labels":["app: gamma"],"title":"feat: hub","repository":"o/app","additions":10,"deletions":0,"workFiles":[]}],"commitMessages":[],"aiReviews":{"fixed":2}},"allocation":{"version":"1.0","totalHours":9.3,"initiatives":[{"initiative":"Gamma","hours":8,"share":0.8648648648648649,"byWorkType":{"quality":4,"new-capability":4},"shipped":[{"kind":"pr","title":"fix: hub","url":"p","repository":"o/app","state":"merged","labels":["app: gamma","impact: high"],"files":["c"],"effortHours":4,"impact":"major"},{"kind":"pr","title":"feat: hub","url":"q","repository":"o/app","state":"merged","labels":["app: gamma"],"effortHours":4}],"inProgress":[],"other":[]},{"initiative":"Ops","hours":1.3,"share":0.13513513513513514,"byWorkType":{"unlogged":1.3},"shipped":[],"inProgress":[],"other":[{"kind":"manual","title":"sync"}]}],"workTypes":[{"workType":"new-capability","label":"New capability","hours":4,"share":0.43243243243243246},{"workType":"quality","label":"Quality & bug fixes","hours":4,"share":0.43243243243243246},{"workType":"unlogged","label":"Meetings & unlogged (self-reported)","hours":1.3,"share":0.13513513513513514}],"manualHours":1.3,"aiFindingsAddressed":2,"note":"Work delivered is a modeled estimate of the manual engineering effort for one engineer to deliver the same changes without AI assistance, split across initiatives by delivered scope. It is not actual hours worked or measured time saved."}},{"date":"2026-10-09","data":{"dateRange":{"from":"2026-10-09","to":"2026-10-09"},"stats":{"estimatedHours":7},"pullRequests":[{"url":"future","state":"merged","labels":[],"title":"feat: hub","repository":"o/app","additions":10,"deletions":0,"workFiles":[]}],"commitMessages":[],"aiReviews":{"fixed":2}},"allocation":{"version":"1.0","totalHours":16,"initiatives":[{"initiative":"Future","hours":9,"share":0.5625,"byWorkType":{"unlogged":9},"shipped":[],"inProgress":[],"other":[{"kind":"manual","title":"Self-reported time"}]},{"initiative":"App","hours":7,"share":0.4375,"byWorkType":{"new-capability":7},"shipped":[{"kind":"pr","title":"feat: hub","url":"future","repository":"o/app","state":"merged","effortHours":7}],"inProgress":[],"other":[]}],"workTypes":[{"workType":"unlogged","label":"Meetings & unlogged (self-reported)","hours":9,"share":0.5625},{"workType":"new-capability","label":"New capability","hours":7,"share":0.4375}],"manualHours":9,"aiFindingsAddressed":2,"note":"Work delivered is a modeled estimate of the manual engineering effort for one engineer to deliver the same changes without AI assistance, split across initiatives by delivered scope. It is not actual hours worked or measured time saved."}}],"windows":[{"from":"2026-09-24","to":"2026-09-30"},{"from":"2026-10-01","to":"2026-10-07"}],"allocations":[{"version":"1.0","totalHours":10,"initiatives":[{"initiative":"Alpha","hours":6,"share":0.6,"byWorkType":{"new-capability":6},"shipped":[],"inProgress":[{"kind":"pr","title":"feat: hub","url":"p","repository":"o/app","state":"open","labels":["app: alpha","impact: low"],"files":["a"],"effortHours":6}],"other":[]},{"initiative":"App","hours":4,"share":0.4,"byWorkType":{"quality":4},"shipped":[],"inProgress":[],"other":[{"kind":"commits","title":"1 direct commit","repository":"o/app"}]}],"workTypes":[{"workType":"new-capability","label":"New capability","hours":6,"share":0.6},{"workType":"quality","label":"Quality & bug fixes","hours":4,"share":0.4}],"manualHours":0,"aiFindingsAddressed":2,"note":"Work delivered is a modeled estimate of the manual engineering effort for one engineer to deliver the same changes without AI assistance, split across initiatives by delivered scope. It is not actual hours worked or measured time saved."},{"version":"1.0","totalHours":6,"initiatives":[{"initiative":"Beta","hours":3.6,"share":0.6,"byWorkType":{"quality":3.6},"shipped":[],"inProgress":[{"kind":"pr","title":"fix: hub","url":"p","repository":"o/app","state":"open","labels":["app: beta"],"files":["b"],"effortHours":3.6}],"other":[]},{"initiative":"App","hours":2.4,"share":0.4000000000000001,"byWorkType":{"quality":2.4},"shipped":[],"inProgress":[],"other":[{"kind":"commits","title":"1 direct commit","repository":"o/app"}]}],"workTypes":[{"workType":"quality","label":"Quality & bug fixes","hours":6,"share":1}],"manualHours":0,"aiFindingsAddressed":2,"note":"Work delivered is a modeled estimate of the manual engineering effort for one engineer to deliver the same changes without AI assistance, split across initiatives by delivered scope. It is not actual hours worked or measured time saved."},{"version":"1.0","totalHours":9.3,"initiatives":[{"initiative":"Gamma","hours":8,"share":0.8648648648648649,"byWorkType":{"quality":4,"new-capability":4},"shipped":[{"kind":"pr","title":"fix: hub","url":"p","repository":"o/app","state":"merged","labels":["app: gamma","impact: high"],"files":["c"],"effortHours":4,"impact":"major"},{"kind":"pr","title":"feat: hub","url":"q","repository":"o/app","state":"merged","labels":["app: gamma"],"effortHours":4}],"inProgress":[],"other":[]},{"initiative":"Ops","hours":1.3,"share":0.13513513513513514,"byWorkType":{"unlogged":1.3},"shipped":[],"inProgress":[],"other":[{"kind":"manual","title":"sync"}]}],"workTypes":[{"workType":"new-capability","label":"New capability","hours":4,"share":0.43243243243243246},{"workType":"quality","label":"Quality & bug fixes","hours":4,"share":0.43243243243243246},{"workType":"unlogged","label":"Meetings & unlogged (self-reported)","hours":1.3,"share":0.13513513513513514}],"manualHours":1.3,"aiFindingsAddressed":2,"note":"Work delivered is a modeled estimate of the manual engineering effort for one engineer to deliver the same changes without AI assistance, split across initiatives by delivered scope. It is not actual hours worked or measured time saved."},{"version":"1.0","totalHours":16,"initiatives":[{"initiative":"Future","hours":9,"share":0.5625,"byWorkType":{"unlogged":9},"shipped":[],"inProgress":[],"other":[{"kind":"manual","title":"Self-reported time"}]},{"initiative":"App","hours":7,"share":0.4375,"byWorkType":{"new-capability":7},"shipped":[{"kind":"pr","title":"feat: hub","url":"future","repository":"o/app","state":"merged","effortHours":7}],"inProgress":[],"other":[]}],"workTypes":[{"workType":"unlogged","label":"Meetings & unlogged (self-reported)","hours":9,"share":0.5625},{"workType":"new-capability","label":"New capability","hours":7,"share":0.4375}],"manualHours":9,"aiFindingsAddressed":2,"note":"Work delivered is a modeled estimate of the manual engineering effort for one engineer to deliver the same changes without AI assistance, split across initiatives by delivered scope. It is not actual hours worked or measured time saved."}],"expectedMerge":{"version":"1.0","totalHours":25.3,"initiatives":[{"initiative":"Gamma","hours":17.6,"share":0.6956521739130436,"byWorkType":{"quality":13.6,"new-capability":4},"shipped":[{"kind":"pr","title":"fix: hub","url":"p","repository":"o/app","state":"merged","labels":["app: gamma","impact: high","app: alpha","impact: low","app: beta"],"files":["c","a","b"],"effortHours":13.6},{"kind":"pr","title":"feat: hub","url":"q","repository":"o/app","state":"merged","labels":["app: gamma"],"effortHours":4}],"inProgress":[],"other":[]},{"initiative":"App","hours":6.4,"share":0.25296442687747034,"byWorkType":{"quality":6.4},"shipped":[],"inProgress":[],"other":[{"kind":"commits","title":"2 direct commits","repository":"o/app"}]},{"initiative":"Ops","hours":1.3,"share":0.05138339920948617,"byWorkType":{"unlogged":1.3},"shipped":[],"inProgress":[],"other":[{"kind":"manual","title":"sync"}]}],"workTypes":[{"workType":"quality","label":"Quality & bug fixes","hours":20,"share":0.7905138339920948},{"workType":"new-capability","label":"New capability","hours":4,"share":0.15810276679841898},{"workType":"unlogged","label":"Meetings & unlogged (self-reported)","hours":1.3,"share":0.05138339920948617}],"manualHours":1.3,"aiFindingsAddressed":6,"note":"Work delivered is a modeled estimate of the manual engineering effort for one engineer to deliver the same changes without AI assistance, split across initiatives by delivered scope. It is not actual hours worked or measured time saved."},"expectedTrend":{"initiatives":["Gamma","App","Ops"],"periods":[{"id":"2026-09-24","label":"Sep 24-30","from":"2026-09-24","to":"2026-09-30","days":0,"allocation":{"version":"1.0","totalHours":1,"initiatives":[{"initiative":"Ops","hours":1,"share":1,"byWorkType":{"unlogged":1},"shipped":[],"inProgress":[],"other":[{"kind":"manual","title":"Self-reported time"}]}],"workTypes":[{"workType":"unlogged","label":"Meetings & unlogged (self-reported)","hours":1,"share":1}],"manualHours":1,"note":"Work delivered is a modeled estimate of the manual engineering effort for one engineer to deliver the same changes without AI assistance, split across initiatives by delivered scope. It is not actual hours worked or measured time saved."}},{"id":"2026-10-01","label":"Oct 1-7","from":"2026-10-01","to":"2026-10-07","days":3,"allocation":{"version":"1.0","totalHours":28.3,"initiatives":[{"initiative":"Gamma","hours":17.6,"share":0.6219081272084807,"byWorkType":{"quality":13.6,"new-capability":4},"shipped":[{"kind":"pr","title":"fix: hub","url":"p","repository":"o/app","state":"merged","labels":["app: gamma","impact: high","app: alpha","impact: low","app: beta"],"files":["c","a","b"],"effortHours":13.6},{"kind":"pr","title":"feat: hub","url":"q","repository":"o/app","state":"merged","labels":["app: gamma"],"effortHours":4}],"inProgress":[],"other":[]},{"initiative":"App","hours":6.4,"share":0.22614840989399293,"byWorkType":{"quality":6.4},"shipped":[],"inProgress":[],"other":[{"kind":"commits","title":"2 direct commits","repository":"o/app"}]},{"initiative":"Ops","hours":4.3,"share":0.1519434628975265,"byWorkType":{"unlogged":4.3},"shipped":[],"inProgress":[],"other":[{"kind":"manual","title":"sync"},{"kind":"manual","title":"Self-reported time"}]}],"workTypes":[{"workType":"quality","label":"Quality & bug fixes","hours":20,"share":0.7067137809187279},{"workType":"unlogged","label":"Meetings & unlogged (self-reported)","hours":4.3,"share":0.1519434628975265},{"workType":"new-capability","label":"New capability","hours":4,"share":0.1413427561837456}],"manualHours":4.3,"aiFindingsAddressed":6,"note":"Work delivered is a modeled estimate of the manual engineering effort for one engineer to deliver the same changes without AI assistance, split across initiatives by delivered scope. It is not actual hours worked or measured time saved."}}]},"reopened":[{"version":"1.0","totalHours":3,"initiatives":[{"initiative":"Alpha","hours":3,"share":1,"byWorkType":{"new-capability":3},"shipped":[],"inProgress":[],"other":[{"kind":"pr","title":"feat: hub","url":"r","repository":"o/app","state":"closed","labels":["app: alpha"],"effortHours":3}]}],"workTypes":[{"workType":"new-capability","label":"New capability","hours":3,"share":1}],"manualHours":0,"aiFindingsAddressed":2,"note":"Work delivered is a modeled estimate of the manual engineering effort for one engineer to deliver the same changes without AI assistance, split across initiatives by delivered scope. It is not actual hours worked or measured time saved."},{"version":"1.0","totalHours":5,"initiatives":[{"initiative":"Beta","hours":5,"share":1,"byWorkType":{"new-capability":5},"shipped":[],"inProgress":[{"kind":"pr","title":"feat: hub","url":"r","repository":"o/app","state":"open","labels":["app: beta"],"effortHours":5}],"other":[]}],"workTypes":[{"workType":"new-capability","label":"New capability","hours":5,"share":1}],"manualHours":0,"aiFindingsAddressed":2,"note":"Work delivered is a modeled estimate of the manual engineering effort for one engineer to deliver the same changes without AI assistance, split across initiatives by delivered scope. It is not actual hours worked or measured time saved."}],"expectedReopened":{"version":"1.0","totalHours":8,"initiatives":[{"initiative":"Beta","hours":8,"share":1,"byWorkType":{"new-capability":8},"shipped":[],"inProgress":[{"kind":"pr","title":"feat: hub","url":"r","repository":"o/app","state":"open","labels":["app: beta","app: alpha"],"effortHours":8}],"other":[]}],"workTypes":[{"workType":"new-capability","label":"New capability","hours":8,"share":1}],"manualHours":0,"aiFindingsAddressed":4,"note":"Work delivered is a modeled estimate of the manual engineering effort for one engineer to deliver the same changes without AI assistance, split across initiatives by delivered scope. It is not actual hours worked or measured time saved."}}"###).unwrap()
    }
    fn equal(a: &Value, b: &Value, path: &str) {
        match (a, b) {
            (Value::Number(a), Value::Number(b)) => assert!(
                (a.as_f64().unwrap() - b.as_f64().unwrap()).abs() < 1e-12,
                "{path}: {a} != {b}"
            ),
            (Value::Array(a), Value::Array(b)) => {
                assert_eq!(a.len(), b.len(), "{path}");
                for (i, (a, b)) in a.iter().zip(b).enumerate() {
                    equal(a, b, &format!("{path}[{i}]"));
                }
            }
            (Value::Object(a), Value::Object(b)) => {
                assert_eq!(a.len(), b.len(), "{path}: {a:?} != {b:?}");
                for (k, v) in a {
                    equal(
                        v,
                        b.get(k).unwrap_or_else(|| panic!("{path}: missing {k}")),
                        &format!("{path}.{k}"),
                    );
                }
            }
            _ => assert_eq!(a, b, "{path}"),
        }
    }
    #[test]
    fn empty_and_label_boundaries() {
        assert_eq!(commit_count("  2foo"), 2);
        assert_eq!(commit_count("-3things"), -3);
        assert_eq!(commit_count("unknown"), 0);
        let empty = merge_allocations(&[] as &[Value]);
        assert_eq!(empty["totalHours"], 0.0);
        assert_eq!(empty["initiatives"], json!([]));
        let config = json!({"initiatives":{}, "labelPrefix":"app:"});
        let make = |hours, labels| {
            compute_allocation(
                &json!({
                    "dateRange":{"from":"2026-01-01","to":"2026-01-01"},
                    "stats":{"estimatedHours":hours},
                    "pullRequests":[{"title":"feat: x","url":"p","repository":"o/a","state":"merged","labels":labels}]
                }),
                &config,
                &[],
            )
        };
        let major = merge_allocations(&[make(12, json!([])), make(13, json!([]))]);
        assert_eq!(major["initiatives"][0]["shipped"][0]["impact"], "major");
        let suppressed = merge_allocations(&[
            make(20, json!(["impact: low"])),
            make(20, json!(["impact: high"])),
        ]);
        assert!(suppressed["initiatives"][0]["shipped"][0]
            .get("impact")
            .is_none());
        assert_eq!(week_label("2025-12-25", "2025-12-31"), "Dec 25-31");
        assert_eq!(
            week_label("2025-12-25", "2026-01-01"),
            "Dec 25, 2025-Jan 1, 2026"
        );
    }
    #[test]
    fn typescript_merge_and_trend_fixtures() {
        let f = fixture();
        equal(
            &merge_allocations(&arr(&f["allocations"])[..3]),
            &f["expectedMerge"],
            "merge",
        );
        equal(
            &merge_allocations(arr(&f["reopened"])),
            &f["expectedReopened"],
            "reopened",
        );
        equal(
            &serde_json::to_value(build_allocation_trend(
                arr(&f["prepared"]),
                arr(&f["windows"]),
                "2026-10-07",
                &f["config"],
                arr(&f["manual"]),
            ))
            .unwrap(),
            &f["expectedTrend"],
            "trend",
        );
    }

    #[test]
    fn cached_periods_respect_end_date() {
        let f = fixture();
        let reports = arr(&f["prepared"]);
        let windows = arr(&f["windows"]);
        let config = &f["config"];
        let manual = arr(&f["manual"]);
        let mut cache = HashMap::new();
        for end in ["2026-10-03", "2026-10-07", "2026-10-09", "2026-10-03"] {
            let expected = serde_json::to_value(build_allocation_trend(
                reports, windows, end, config, manual,
            ))
            .unwrap();
            let cached =
                build_allocation_trend_cached(reports, windows, end, config, manual, &mut cache);
            equal(
                &serde_json::to_value(cached).unwrap(),
                &expected,
                "cached trend",
            );
        }
    }
}
