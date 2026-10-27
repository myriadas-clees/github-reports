use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{self, BufWriter, Read, Write};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input)?;
    let input: Value = serde_json::from_str(&input)?;
    if let Some(inputs) = input.as_array() {
        let results: Vec<_> = inputs
            .iter()
            .map(|item| {
                let labels: Vec<_> = item["labels"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter_map(Value::as_str)
                    .map(str::to_owned)
                    .collect();
                worklog_allocation_bench::classify_work_type(
                    item["text"].as_str().unwrap_or(""),
                    &labels,
                )
            })
            .collect();
        let mut output = BufWriter::new(io::stdout().lock());
        serde_json::to_writer(&mut output, &results)?;
        output.flush()?;
        return Ok(());
    }
    let reports = input["reports"].as_array().ok_or("missing reports")?;
    let config = &input["config"];
    let manual = input["manual"].as_array().ok_or("missing manual time")?;
    let daily: Vec<_> = reports
        .iter()
        .map(|report| {
            worklog_allocation_bench::daily::compute_allocation_precise(
                &report["data"],
                config,
                manual,
            )
        })
        .collect();
    let prepared: Vec<_> = reports.iter().zip(&daily).map(|(report, allocation)| {
        json!({"date":report["date"],"data":{"dateRange":report["data"]["dateRange"]},"allocation":allocation})
    }).collect();
    let requests = input["requests"]
        .as_array()
        .ok_or("missing trend requests")?;
    let mut cache = HashMap::new();
    let trends: Vec<_> = requests
        .iter()
        .map(|request| {
            worklog_allocation_bench::rollup::build_allocation_trend_cached(
                &prepared,
                request["windows"]
                    .as_array()
                    .map(Vec::as_slice)
                    .unwrap_or(&[]),
                request["end"].as_str().unwrap_or(""),
                config,
                manual,
                &mut cache,
            )
        })
        .collect();
    let mut public_daily = daily.clone();
    for allocation in &mut public_daily {
        worklog_allocation_bench::daily::strip_precision(allocation);
    }
    let mut output = BufWriter::new(io::stdout().lock());
    #[derive(Serialize)]
    struct Output<'a> {
        daily: &'a [Value],
        trends: &'a [worklog_allocation_bench::rollup::Trend],
    }
    serde_json::to_writer(
        &mut output,
        &Output {
            daily: &public_daily,
            trends: &trends,
        },
    )?;
    output.flush()?;
    Ok(())
}
