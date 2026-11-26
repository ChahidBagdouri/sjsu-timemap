import { describe, expect, it } from "vitest";
import { aggregate, average, binGrid, mergeIntervals } from "./engine";
import type { Section } from "./types";
const term = {
  id: "spring-2027",
  label: "Spring 2027",
  timeZone: "America/Los_Angeles",
  startDate: "2027-02-01",
  endDate: "2027-02-14",
};
const view = {
  mode: "semester" as const,
  week: "2027-02-01",
  metric: "sections" as const,
  place: "all" as const,
};
function section(
  meetings: [number, number, string, string][],
  extra: Partial<Section> = {},
): Section {
  return {
    id: "1",
    classNumber: "1",
    course: "CS 1",
    subject: "CS",
    section: "01",
    title: "Test",
    modality: "In Person",
    component: "LEC",
    instructor: "",
    notes: "",
    requirements: "",
    status: "active",
    college: null,
    department: null,
    courseLevel: null,
    enrollment: 40,
    capacity: 50,
    waitlist: 0,
    combinedGroup: null,
    combinedFlag: false,
    weightingEligible: true,
    enrollmentObservedAt: null,
    meetings: meetings.map(([startMinute, endMinute, startDate, endDate]) => ({
      days: [0],
      startMinute,
      endMinute,
      startDate,
      endDate,
      location: "ENG 1",
      kind: "scheduled",
    })),
    ...extra,
  };
}
describe("exact time concentration", () => {
  it("uses exclusive ends and preserves a 10:15 dismissal", () => {
    const r = aggregate(
      [section([[540, 615, term.startDate, term.endDate]])],
      term,
      view,
    );
    expect(r.minutes[0][614]).toBe(1);
    expect(r.minutes[0][615]).toBe(0);
  });
  it("unions duplicate and overlapping meetings within a section", () => {
    const r = aggregate(
      [
        section([
          [540, 615, term.startDate, term.endDate],
          [540, 615, term.startDate, term.endDate],
          [600, 660, term.startDate, term.endDate],
        ]),
      ],
      term,
      view,
    );
    expect(r.minutes[0][610]).toBe(1);
    expect(r.minutes[0][659]).toBe(1);
  });
  it("weights short sessions by actual weekday occurrences", () => {
    const r = aggregate(
      [section([[540, 600, "2027-02-01", "2027-02-07"]])],
      term,
      view,
    );
    expect(r.minutes[0][550]).toBe(0.5);
  });
  it("does not combine disjoint date windows before deduplication", () => {
    const r = aggregate(
      [
        section([
          [540, 600, "2027-02-01", "2027-02-07"],
          [570, 630, "2027-02-08", "2027-02-14"],
        ]),
      ],
      term,
      view,
    );
    expect(r.minutes[0][580]).toBe(1);
    expect(r.minutes[0][550]).toBe(0.5);
  });
  it("preserves area across display resolutions and partial final bins", () => {
    const r = aggregate(
      [section([[547, 613, term.startDate, term.endDate]])],
      term,
      view,
    );
    for (const size of [5, 15, 30]) {
      const bins = binGrid(r, 540, 620, size)[0];
      const area = bins.reduce(
        (n, x, i) => n + x * Math.min(size, 620 - (540 + i * size)),
        0,
      );
      expect(area).toBeCloseTo(66);
    }
  });
  it("keeps missing and combined enrollment unknown, including real zero", () => {
    const a = section([[540, 600, term.startDate, term.endDate]], {
      enrollment: null,
      weightingEligible: false,
    });
    const b = section([[540, 600, term.startDate, term.endDate]], {
      combinedFlag: true,
    });
    const c = section([[540, 600, term.startDate, term.endDate]], {
      enrollment: 0,
    });
    const r = aggregate([a, b, c], term, { ...view, metric: "enrollment" });
    expect(r.timedSections).toBe(3);
    expect(r.weightedSections).toBe(1);
    expect(r.peak).toBe(0);
  });
  it("uses the requested week and excludes canceled sections", () => {
    const a = section([[540, 600, "2027-02-01", "2027-02-07"]]);
    const b = section([[540, 600, term.startDate, term.endDate]], {
      status: "canceled",
    });
    expect(
      aggregate([a, b], term, { ...view, mode: "week", week: "2027-02-08" })
        .peak,
    ).toBe(0);
  });
  it("does not label timed meetings excluded by location as unknown", () => {
    const online = section([[540, 600, term.startDate, term.endDate]]);
    online.meetings[0].location = "ONLINE";
    const asynchronous = section([]);
    const r = aggregate([online, asynchronous], term, {
      ...view,
      place: "campus",
    });
    expect(r.timedSections).toBe(0);
    expect(r.unknownTimeSections).toBe(1);
  });
  it("merges intervals without mutating inputs", () => {
    const a: [number, number][] = [
      [10, 20],
      [0, 15],
    ];
    expect(mergeIntervals(a)).toEqual([[0, 20]]);
    expect(a).toEqual([
      [10, 20],
      [0, 15],
    ]);
    expect(average(new Float64Array([1, 3]), 0, 2)).toBe(2);
  });
});
