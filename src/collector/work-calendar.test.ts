import { describe, it, expect } from "vitest";
import { buildWorkCalendar, describeWeekendAttribution, mondayOf, type CalendarReport } from "./work-calendar.js";

// October 2026: Fri 2, Sat 3, Sun 4, Mon 5 … Fri 9, Sat 10, Sun 11, Mon 12.
const r = (date: string, hours = 4): CalendarReport => ({ date, hours });

describe("work calendar: Mon–Fri weeks", () => {
  it("keys every weekday by its Monday, even when the Monday report is missing", () => {
    const cal = buildWorkCalendar([r("2026-10-06"), r("2026-10-09")]);
    for (const d of ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"]) {
      expect(cal.groupIdOf(d)).toBe("2026-10-05");
    }
    expect(cal.group("2026-10-05")).toMatchObject({
      id: "2026-10-05", kind: "week", from: "2026-10-05", to: "2026-10-09",
      firstReport: "2026-10-06", lastReport: "2026-10-09", label: "Oct 6-9",
    });
  });

  it("labels a week by its first and last available weekday reports (missing Friday / holidays)", () => {
    const cal = buildWorkCalendar([r("2026-10-05"), r("2026-10-08")]);
    expect(cal.group("2026-10-05").label).toBe("Oct 5-8");
    // A week with a single report shows that day; a week with none shows the nominal span.
    expect(buildWorkCalendar([r("2026-10-07")]).group("2026-10-05").label).toBe("Oct 7");
    expect(cal.group("2026-10-12")).toMatchObject({ label: "Oct 12-16", reportDates: [], weekends: [] });
  });

  it("does not stretch the label to attributed weekend days", () => {
    const cal = buildWorkCalendar([r("2026-10-08"), r("2026-10-09", 2), r("2026-10-10"), r("2026-10-12", 6)]);
    expect(cal.groupIdOf("2026-10-10")).toBe("2026-10-05");
    expect(cal.group("2026-10-05")).toMatchObject({
      label: "Oct 8-9",
      reportDates: ["2026-10-08", "2026-10-09", "2026-10-10"],
    });
  });

  it("crosses month and year boundaries", () => {
    expect(mondayOf("2027-01-01")).toBe("2026-12-28");
    const cal = buildWorkCalendar([r("2026-12-31"), r("2027-01-01", 1), r("2027-01-02"), r("2027-01-04", 3)]);
    expect(cal.group("2026-12-28").label).toBe("Dec 31, 2026-Jan 1, 2027");
    // Sat Jan 2 sits between Fri Jan 1 (1h) and Mon Jan 4 (3h): Friday is lower.
    expect(cal.groupIdOf("2027-01-02")).toBe("2026-12-28");
    // Sat Oct 31 / Sun Nov 1 2026, between Fri Oct 30 and Mon Nov 2.
    const month = buildWorkCalendar([r("2026-10-30", 9), r("2026-10-31"), r("2026-11-01"), r("2026-11-02", 1)]);
    expect(month.groupIdOf("2026-10-31")).toBe("2026-11-02");
    expect(month.groupIdOf("2026-11-01")).toBe("2026-11-02");
  });
});

describe("work calendar: weekend attribution", () => {
  it("joins the adjacent Friday when its modeled effort is lower", () => {
    const cal = buildWorkCalendar([r("2026-10-09", 2), r("2026-10-10"), r("2026-10-11"), r("2026-10-12", 5)]);
    expect(cal.weekendOf("2026-10-11")).toMatchObject({
      target: "friday", reason: "lower-effort", groupId: "2026-10-05",
      fridayHours: 2, mondayHours: 5, activeDates: ["2026-10-10", "2026-10-11"],
    });
    expect(cal.group("2026-10-05").reportDates).toEqual(["2026-10-09", "2026-10-10", "2026-10-11"]);
    expect(cal.group("2026-10-12").reportDates).toEqual(["2026-10-12"]);
  });

  it("joins the adjacent Monday when its modeled effort is lower, using effort before weekend additions", () => {
    // The Saturday's own 20h does not count toward either side's comparison.
    const cal = buildWorkCalendar([r("2026-10-09", 5), r("2026-10-10", 20), r("2026-10-12", 2)]);
    expect(cal.weekendOf("2026-10-10")).toMatchObject({ target: "monday", reason: "lower-effort", groupId: "2026-10-12" });
    expect(cal.group("2026-10-12").reportDates).toEqual(["2026-10-10", "2026-10-12"]);
  });

  it("sends ties (including float noise) to Friday", () => {
    const tie = buildWorkCalendar([r("2026-10-09", 3), r("2026-10-10"), r("2026-10-12", 3)]);
    expect(tie.weekendOf("2026-10-10")).toMatchObject({ target: "friday", reason: "tie", groupId: "2026-10-05" });
    const noisy = buildWorkCalendar([r("2026-10-09", 0.1 + 0.2), r("2026-10-10"), r("2026-10-12", 0.3)]);
    expect(noisy.weekendOf("2026-10-10")?.reason).toBe("tie");
    const zero = buildWorkCalendar([r("2026-10-09", 0), r("2026-10-11"), r("2026-10-12", 0)]);
    expect(zero.weekendOf("2026-10-11")?.target).toBe("friday");
  });

  it("uses the only existing adjacent report when the other day is a holiday", () => {
    // Monday holiday: Friday is the only neighbour, however busy it was.
    const monHoliday = buildWorkCalendar([r("2026-10-09", 40), r("2026-10-10"), r("2026-10-13", 1)]);
    expect(monHoliday.weekendOf("2026-10-10")).toMatchObject({ target: "friday", reason: "only-friday", groupId: "2026-10-05" });
    // Friday holiday: Monday is the only neighbour; the Thursday report does not count.
    const friHoliday = buildWorkCalendar([r("2026-10-08", 1), r("2026-10-10"), r("2026-10-12", 40)]);
    expect(friHoliday.weekendOf("2026-10-10")).toMatchObject({ target: "monday", reason: "only-monday", groupId: "2026-10-12" });
  });

  it("keeps an explicit weekend entry when neither Friday nor Monday has a report", () => {
    const cal = buildWorkCalendar([r("2026-10-08"), r("2026-10-10", 2), r("2026-10-11", 3), r("2026-10-13")]);
    expect(cal.weekendOf("2026-10-11")).toMatchObject({ target: "weekend", reason: "no-adjacent-report", groupId: "2026-10-10" });
    expect(cal.groups.map((g) => [g.id, g.kind, g.label, g.reportDates])).toEqual([
      ["2026-10-05", "week", "Oct 8", ["2026-10-08"]],
      ["2026-10-10", "weekend", "Oct 10-11 weekend", ["2026-10-10", "2026-10-11"]],
      ["2026-10-12", "week", "Oct 13", ["2026-10-13"]],
    ]);
    expect(cal.group("2026-10-10")).toMatchObject({ from: "2026-10-10", to: "2026-10-11" });
  });

  it("gives self-reported weekend time a home with the same rules", () => {
    const cal = buildWorkCalendar([r("2026-10-09", 2), r("2026-10-12", 5)], { activityDates: ["2026-10-11", "2026-10-17"] });
    expect(cal.weekendOf("2026-10-11")).toMatchObject({ groupId: "2026-10-05", activeDates: ["2026-10-11"] });
    // A manual-only weekend after Fri Oct 16 / Mon Oct 19 with no reports at all stays explicit.
    expect(cal.groups.map((g) => g.id)).toEqual(["2026-10-05", "2026-10-12", "2026-10-17"]);
    // Manual-only days are activity, not reports.
    expect(cal.group("2026-10-05").reportDates).toEqual(["2026-10-09"]);
  });

  it("maps every active date to exactly one group", () => {
    const dates = ["2026-10-02", "2026-10-03", "2026-10-04", "2026-10-07", "2026-10-10", "2026-10-12", "2026-10-17", "2026-10-18", "2026-10-20"];
    const cal = buildWorkCalendar(dates.map((d, i) => r(d, i + 1)));
    const listed = cal.groups.flatMap((g) => g.reportDates);
    expect([...listed].sort()).toEqual(dates);
    for (const d of dates) expect(cal.group(cal.groupIdOf(d)).reportDates).toContain(d);
  });
});

describe("work calendar: cutoffs", () => {
  const reports = [r("2026-10-09", 6), r("2026-10-10"), r("2026-10-12", 2), r("2026-10-13")];

  it("never lets a later report decide a historical weekend", () => {
    // As of Saturday the Monday report does not exist yet: the weekend joins Friday.
    const sat = buildWorkCalendar(reports, { cutoff: "2026-10-10" });
    expect(sat.weekendOf("2026-10-10")).toMatchObject({ target: "friday", reason: "only-friday" });
    expect(sat.groups.map((g) => g.id)).toEqual(["2026-10-05"]);
    expect(sat.group("2026-10-05").reportDates).toEqual(["2026-10-09", "2026-10-10"]);
    // From Monday on, Monday's lower effort moves the weekend.
    const mon = buildWorkCalendar(reports, { cutoff: "2026-10-12" });
    expect(mon.weekendOf("2026-10-10")).toMatchObject({ target: "monday", reason: "lower-effort" });
    expect(mon.group("2026-10-12")).toMatchObject({ reportDates: ["2026-10-10", "2026-10-12"], label: "Oct 12" });
    // Activity after the cutoff is ignored as well.
    expect(buildWorkCalendar(reports, { cutoff: "2026-10-09", activityDates: ["2026-10-11"] }).groups.map((g) => g.reportDates))
      .toEqual([["2026-10-09"]]);
  });
});

describe("describeWeekendAttribution", () => {
  it("explains each outcome in plain words with original dates", () => {
    const say = (reports: CalendarReport[], date: string) =>
      describeWeekendAttribution(buildWorkCalendar(reports).weekendOf(date)!);
    expect(say([r("2026-10-09", 2), r("2026-10-10"), r("2026-10-12", 5)], "2026-10-10"))
      .toBe("Sat, Oct 10 counted with Friday Oct 9: lower modeled effort than the following Monday (2h vs 5h).");
    expect(say([r("2026-10-09", 5), r("2026-10-11"), r("2026-10-12", 2.25)], "2026-10-11"))
      .toBe("Sun, Oct 11 counted with Monday Oct 12: lower modeled effort than the preceding Friday (2.3h vs 5h).");
    expect(say([r("2026-10-09", 3), r("2026-10-10"), r("2026-10-11"), r("2026-10-12", 3)], "2026-10-10"))
      .toBe("Sat, Oct 10 and Sun, Oct 11 counted with Friday Oct 9: equal modeled effort with the following Monday (3h); ties go to Friday.");
    expect(say([r("2026-10-09"), r("2026-10-10")], "2026-10-10"))
      .toBe("Sat, Oct 10 counted with Friday Oct 9: no report for the following Monday.");
    expect(say([r("2026-10-10"), r("2026-10-12")], "2026-10-10"))
      .toBe("Sat, Oct 10 counted with Monday Oct 12: no report for the preceding Friday.");
    expect(say([r("2026-10-10")], "2026-10-10"))
      .toBe("Sat, Oct 10 shown as its own weekend entry: no report for the adjacent Friday or Monday.");
  });
});
