import { describe, expect, it } from "vitest";
import {
  rankEventOpportunities,
  type OpportunityOptions,
} from "./opportunities";
import type { Meeting, Section } from "./types";

const term = {
  id: "spring-2027",
  label: "Spring 2027",
  timeZone: "America/Los_Angeles",
  startDate: "2027-02-01",
  endDate: "2027-02-12",
};
const period = { mode: "semester" as const, week: "2027-02-01" };
const options: OpportunityOptions = {
  duration: 60,
  buffer: 0,
  proximity: 60,
  dayStart: 540,
  dayEnd: 840,
};
function meeting(
  start: number,
  end: number,
  extra: Partial<Meeting> = {},
): Meeting {
  return {
    startMinute: start,
    endMinute: end,
    days: [0],
    startDate: term.startDate,
    endDate: term.endDate,
    location: "ENG 1",
    kind: "scheduled",
    ...extra,
  };
}
function section(
  id: string,
  meetings: Meeting[],
  extra: Partial<Section> = {},
): Section {
  return {
    id,
    classNumber: id,
    course: "CS " + id,
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
    meetings,
    ...extra,
  };
}
function analyze(
  sections: Section[],
  overrides: Partial<OpportunityOptions> = {},
) {
  return rankEventOpportunities(sections, term, period, {
    ...options,
    ...overrides,
  });
}
function at(result: ReturnType<typeof analyze>, start = 600, day = 0) {
  return result.candidates.find((w) => w.day === day && w.start === start)!;
}

describe("schedule-derived event opportunities", () => {
  it("counts any conflict once per section, with exclusive boundaries and travel buffers", () => {
    const sections = [
      section("before", [meeting(540, 600)]),
      section("after", [meeting(660, 720)]),
      section("overlap", [
        meeting(630, 660),
        meeting(630, 660),
        meeting(645, 690),
      ]),
    ];
    expect(at(analyze(sections)).conflicts).toBe(40);
    expect(at(analyze(sections, { buffer: 10 })).conflicts).toBe(120);
  });
  it("includes online conflicts but only known physical meetings create nearby activity", () => {
    const result = analyze([
      section("campus", [meeting(540, 600)], { enrollment: 20 }),
      section("online", [meeting(600, 660, { location: "ONLINE" })], {
        enrollment: 30,
      }),
      section("unknown-room", [meeting(540, 600, { location: "TBA" })]),
      section("off-campus", [meeting(540, 600, { location: "OFF CAMPUS" })]),
    ]);
    expect(at(result).conflicts).toBe(30);
    expect(at(result).nearby).toBe(20);
    expect(result.coverage.physicalSections).toBe(1);
  });
  it("uses the stronger boundary once, even with repeated and adjacent meeting markup", () => {
    const result = analyze([
      section(
        "both",
        [
          meeting(540, 570),
          meeting(570, 590),
          meeting(540, 590),
          meeting(670, 720),
        ],
        { enrollment: 60 },
      ),
    ]);
    expect(at(result).nearby).toBeCloseTo(50);
    expect(at(result).ending + at(result).starting).toBeCloseTo(50);
  });
  it("does not count a released section as nearby if another component conflicts", () => {
    const result = analyze([
      section("lecture-and-lab", [
        meeting(540, 600),
        meeting(630, 650, { location: "ONLINE" }),
      ]),
    ]);
    expect(at(result).conflicts).toBe(40);
    expect(at(result).nearby).toBe(0);
  });
  it("preserves date-specific patterns before computing weekday averages", () => {
    const sections = [
      section("short-sessions", [
        meeting(540, 600, { endDate: "2027-02-05" }),
        meeting(600, 660, { startDate: "2027-02-08" }),
      ]),
    ];
    expect(at(analyze(sections)).conflicts).toBe(20);
    expect(at(analyze(sections)).nearby).toBe(20);
    const first = rankEventOpportunities(
      sections,
      term,
      { mode: "week", week: "2027-02-01" },
      options,
    );
    const second = rankEventOpportunities(
      sections,
      term,
      { mode: "week", week: "2027-02-08" },
      options,
    );
    expect(at(first).nearby).toBe(40);
    expect(at(first).conflicts).toBe(0);
    expect(at(second).nearby).toBe(0);
    expect(at(second).conflicts).toBe(40);
  });
  it("omits unknown and combined weights, preserves zero, and reports coverage", () => {
    const result = analyze([
      section("known", [meeting(540, 600)]),
      section("zero", [meeting(540, 600)], { enrollment: 0 }),
      section("unknown", [meeting(540, 600)], {
        enrollment: null,
        weightingEligible: false,
      }),
      section("combined", [meeting(540, 600)], { combinedFlag: true }),
      section("canceled", [meeting(540, 600)], { status: "canceled" }),
      section("tentative", [meeting(540, 600)], { status: "tentative" }),
      section("asynchronous", [
        meeting(0, 0, { kind: "asynchronous", days: [] }),
      ]),
    ]);
    expect(result.coverage).toMatchObject({
      timedSections: 4,
      eligibleSections: 2,
      missingEnrollment: 1,
      combinedSections: 1,
      unknownTimeSections: 1,
    });
    expect(at(result).nearby).toBe(40);
  });
  it("does not dilute a one-minute conflict over the event's duration", () => {
    const result = analyze([
      section("short-conflict", [meeting(659, 660)], { enrollment: 70 }),
    ]);
    expect(at(result).conflicts).toBe(70);
  });
  it("evaluates activity after the event ends, rather than after its start", () => {
    const sections = [section("next", [meeting(645, 720)])];
    expect(at(analyze(sections, { duration: 30 })).nearby).toBe(30);
    expect(at(analyze(sections, { duration: 30 })).conflicts).toBe(0);
    expect(at(analyze(sections)).nearby).toBe(0);
    expect(at(analyze(sections)).conflicts).toBe(40);
  });
  it("implements the documented formula with shared normalization across weekdays", () => {
    const result = analyze([
      section("campus", [meeting(540, 600, { days: [0, 1, 2, 3, 4] })]),
      section("online", [
        meeting(630, 690, { days: [0, 2], location: "ONLINE" }),
      ]),
    ]);
    for (const w of result.candidates) {
      expect(w.normalizedActivity).toBeCloseTo(w.nearby / result.maxActivity);
      expect(w.normalizedConflicts).toBeCloseTo(
        w.conflicts / result.maxConflicts,
      );
      expect(w.score).toBeCloseTo(
        100 * w.normalizedActivity * (1 - w.normalizedConflicts),
      );
      expect(w.score).toBeGreaterThanOrEqual(0);
      expect(w.score).toBeLessThanOrEqual(100);
    }
  });
  it("does not recommend empty-campus or online-only windows", () => {
    for (const sections of [
      [],
      [section("online", [meeting(540, 600, { location: "ONLINE" })])],
    ]) {
      const result = analyze(sections);
      expect(result.suggestions).toEqual([]);
      expect(
        result.candidates.every(
          (w) => w.score === 0 && Number.isFinite(w.score),
        ),
      ).toBe(true);
    }
    const active = analyze([section("campus", [meeting(540, 600)])]);
    expect(active.suggestions[0].start).toBe(600);
    expect(at(active, 780).score).toBe(0);
  });
  it("returns descending scores and nonoverlapping suggestions", () => {
    const result = analyze([
      section("campus", [meeting(540, 600, { days: [0, 1, 2, 3, 4] })]),
    ]);
    expect(result.suggestions).toHaveLength(5);
    result.suggestions.forEach((w, i) => {
      if (i)
        expect(w.score).toBeLessThanOrEqual(result.suggestions[i - 1].score);
      expect(
        result.suggestions.some(
          (other) =>
            other !== w &&
            other.day === w.day &&
            other.start < w.end &&
            other.end > w.start,
        ),
      ).toBe(false);
    });
  });
  it("reports all nine assumption settings and retains the chosen setting's exact rank", () => {
    const result = analyze([
      section("campus", [meeting(540, 600)]),
      section("later", [meeting(720, 780, { days: [1] })]),
    ]);
    const w = at(result);
    expect(w.settings).toHaveLength(9);
    expect(
      new Set(w.settings.map((s) => [s.buffer, s.proximity].join("-"))).size,
    ).toBe(9);
    expect(
      w.settings.find((s) => s.buffer === 0 && s.proximity === 60)?.rank,
    ).toBe(w.rank);
    expect(w.minRank).toBeLessThanOrEqual(w.rank);
    expect(w.maxRank).toBeGreaterThanOrEqual(w.rank);
    expect(w.topSettings).toBe(
      w.settings.filter((s) => s.score > 1e-9 && s.rank <= result.topCutoff)
        .length,
    );
  });
  it("clips candidate weekdays to published dates and handles out-of-term weeks", () => {
    const outside = rankEventOpportunities(
      [],
      term,
      { mode: "week", week: "2027-03-01" },
      options,
    );
    expect(outside.candidateCount).toBe(0);
    expect(outside.suggestions).toEqual([]);
    const partial = rankEventOpportunities(
      [],
      { ...term, startDate: "2027-02-03", endDate: "2027-02-05" },
      period,
      options,
    );
    expect(new Set(partial.candidates.map((w) => w.day))).toEqual(
      new Set([2, 3, 4]),
    );
  });
});
