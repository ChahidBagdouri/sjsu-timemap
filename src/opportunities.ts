import {
  addDays,
  dateISO,
  dateNumber,
  matchesPlace,
  mergeIntervals,
  monday,
  weight,
  type View,
} from "./engine";
import type { Section, Term } from "./types";

export const PROXIMITY_WINDOWS = [30, 60, 90] as const;
export const TRAVEL_BUFFERS = [0, 10, 15] as const;
export type ProximityWindow = (typeof PROXIMITY_WINDOWS)[number];
export type TravelBuffer = (typeof TRAVEL_BUFFERS)[number];
export type OpportunityPeriod = Pick<View, "mode" | "week">;
export type OpportunityOptions = {
  duration: number;
  buffer: TravelBuffer;
  proximity: ProximityWindow;
  dayStart?: number;
  dayEnd?: number;
  step?: number;
  limit?: number;
};
export type OpportunitySetting = {
  buffer: TravelBuffer;
  proximity: ProximityWindow;
  score: number;
  rank: number;
};
export type OpportunityWindow = {
  day: number;
  start: number;
  end: number;
  conflicts: number;
  nearby: number;
  ending: number;
  starting: number;
  normalizedActivity: number;
  normalizedConflicts: number;
  score: number;
  rank: number;
  settings: OpportunitySetting[];
  topSettings: number;
  minRank: number;
  maxRank: number;
};
export type OpportunityCoverage = {
  timedSections: number;
  eligibleSections: number;
  missingEnrollment: number;
  combinedSections: number;
  unknownTimeSections: number;
  physicalSections: number;
};
export type OpportunityRanking = {
  candidates: OpportunityWindow[];
  suggestions: OpportunityWindow[];
  coverage: OpportunityCoverage;
  candidateCount: number;
  topCutoff: number;
  maxActivity: number;
  maxConflicts: number;
};
type Interval = [number, number];
type OccurrenceGroup = {
  day: number;
  weight: number;
  busy: Interval[];
  physical: Interval[];
};
type Totals = {
  buffer: TravelBuffer;
  proximity: ProximityWindow;
  conflicts: Float64Array;
  nearby: Float64Array;
  ending: Float64Array;
  starting: Float64Array;
};
const EPSILON = 1e-9;

function prepare(sections: Section[], term: Term, period: OpportunityPeriod) {
  const from =
    period.mode === "semester" ? term.startDate : monday(period.week);
  const to = period.mode === "semester" ? term.endDate : addDays(from, 6);
  const dates: string[][] = Array.from({ length: 5 }, () => []);
  const start = from > term.startDate ? from : term.startDate;
  const end = to < term.endDate ? to : term.endDate;
  for (let ms = dateNumber(start); ms <= dateNumber(end); ms += 86400000) {
    const day = (new Date(ms).getUTCDay() + 6) % 7;
    if (day < 5) dates[day].push(dateISO(ms));
  }
  const coverage: OpportunityCoverage = {
    timedSections: 0,
    eligibleSections: 0,
    missingEnrollment: 0,
    combinedSections: 0,
    unknownTimeSections: 0,
    physicalSections: 0,
  };
  const groups: OccurrenceGroup[] = [];
  if (start > end) return { dates, groups, coverage };
  for (const section of sections) {
    if (section.status !== "active") continue;
    const timed = section.meetings.filter(
      (m) =>
        m.kind === "scheduled" &&
        m.startMinute !== null &&
        m.endMinute !== null,
    );
    if (!timed.length) {
      if (
        section.meetings.some((m) => m.startDate <= end && m.endDate >= start)
      )
        coverage.unknownTimeSections++;
      continue;
    }
    const active = timed.some((m) =>
      m.days.some((day) =>
        dates[day]?.some((date) => m.startDate <= date && m.endDate >= date),
      ),
    );
    if (!active) continue;
    coverage.timedSections++;
    if (section.enrollment === null) coverage.missingEnrollment++;
    if (section.combinedFlag) coverage.combinedSections++;
    const enrollment = weight(section, "enrollment");
    if (enrollment === null) continue;
    coverage.eligibleSections++;
    let hasPhysical = false;
    for (let day = 0; day < 5; day++) {
      if (!dates[day].length) continue;
      const dayMeetings = timed.filter((m) => m.days.includes(day));
      if (!dayMeetings.length) continue;
      // Reuse identical daily patterns without combining disjoint date ranges.
      const patterns = new Map<
        string,
        { busy: Interval[]; physical: Interval[]; count: number }
      >();
      for (const date of dates[day]) {
        const meetings = dayMeetings.filter(
          (m) => m.startDate <= date && m.endDate >= date,
        );
        if (!meetings.length) continue;
        const busy = mergeIntervals(
          meetings.map((m) => [m.startMinute!, m.endMinute!]),
        );
        const physical = mergeIntervals(
          meetings
            .filter((m) => matchesPlace(m, "campus"))
            .map((m) => [m.startMinute!, m.endMinute!]),
        );
        hasPhysical ||= physical.length > 0;
        const key = JSON.stringify([busy, physical]);
        const pattern = patterns.get(key);
        if (pattern) pattern.count++;
        else patterns.set(key, { busy, physical, count: 1 });
      }
      for (const pattern of patterns.values())
        groups.push({
          day,
          weight: (enrollment * pattern.count) / dates[day].length,
          busy: pattern.busy,
          physical: pattern.physical,
        });
    }
    if (hasPhysical) coverage.physicalSections++;
  }
  return { dates, groups, coverage };
}

/** A schedule-derived relative index, never a probability or unique-person count. */
export function rankEventOpportunities(
  sections: Section[],
  term: Term,
  period: OpportunityPeriod,
  options: OpportunityOptions,
): OpportunityRanking {
  const { duration, buffer, proximity } = options;
  const dayStart = options.dayStart ?? 540;
  const dayEnd = options.dayEnd ?? 1200;
  const step = options.step ?? 15;
  if (
    !Number.isInteger(duration) ||
    duration <= 0 ||
    !Number.isInteger(step) ||
    step <= 0 ||
    dayStart < 0 ||
    dayEnd > 1440 ||
    dayStart >= dayEnd ||
    !TRAVEL_BUFFERS.includes(buffer) ||
    !PROXIMITY_WINDOWS.includes(proximity)
  )
    throw new Error("Invalid event opportunity settings.");
  const { dates, groups, coverage } = prepare(sections, term, period);
  const slots: { day: number; start: number; end: number }[] = [];
  const byDay: number[][] = Array.from({ length: 5 }, () => []);
  for (let day = 0; day < 5; day++) {
    if (!dates[day].length) continue;
    for (let start = dayStart; start + duration <= dayEnd; start += step) {
      byDay[day].push(slots.length);
      slots.push({ day, start, end: start + duration });
    }
  }
  const scenarios: Totals[] = [];
  for (const travel of TRAVEL_BUFFERS) {
    const conflicts = new Float64Array(slots.length);
    const settings = PROXIMITY_WINDOWS.map((window) => ({
      buffer: travel,
      proximity: window,
      conflicts,
      nearby: new Float64Array(slots.length),
      ending: new Float64Array(slots.length),
      starting: new Float64Array(slots.length),
    }));
    for (const group of groups) {
      for (const index of byDay[group.day]) {
        const slot = slots[index];
        const from = slot.start - travel,
          to = slot.end + travel;
        // Any overlap disqualifies this section for the whole event; count once.
        if (group.busy.some(([a, b]) => a < to && b > from)) {
          conflicts[index] += group.weight;
          continue;
        }
        let before = Infinity,
          after = Infinity;
        for (const [a, b] of group.physical) {
          if (b <= from) before = Math.min(before, from - b);
          if (a >= to) after = Math.min(after, a - to);
        }
        for (const setting of settings) {
          const ending = Math.max(0, 1 - before / setting.proximity);
          const starting = Math.max(0, 1 - after / setting.proximity);
          const contribution = group.weight * Math.max(ending, starting);
          setting.nearby[index] += contribution;
          // The stronger boundary wins, so one section never counts twice.
          if (ending >= starting) setting.ending[index] += contribution;
          else setting.starting[index] += contribution;
        }
      }
    }
    scenarios.push(...settings);
  }
  const evaluated = scenarios.map((setting) => {
    const maxActivity = Math.max(0, ...setting.nearby);
    const maxConflicts = Math.max(0, ...setting.conflicts);
    const windows = slots.map((slot, i) => {
      const normalizedActivity = maxActivity
        ? setting.nearby[i] / maxActivity
        : 0;
      const normalizedConflicts = maxConflicts
        ? setting.conflicts[i] / maxConflicts
        : 0;
      return {
        ...slot,
        conflicts: setting.conflicts[i],
        nearby: setting.nearby[i],
        ending: setting.ending[i],
        starting: setting.starting[i],
        normalizedActivity,
        normalizedConflicts,
        score: 100 * normalizedActivity * (1 - normalizedConflicts),
        rank: 0,
        index: i,
      };
    });
    const sorted = [...windows].sort(compare);
    let rank = 1;
    sorted.forEach((window, index) => {
      if (index && Math.abs(window.score - sorted[index - 1].score) > EPSILON)
        rank = index + 1;
      window.rank = rank;
    });
    return { ...setting, windows, maxActivity, maxConflicts };
  });
  const selected = evaluated.find(
    (s) => s.buffer === buffer && s.proximity === proximity,
  )!;
  const topCutoff = Math.ceil(slots.length * 0.1);
  const candidates: OpportunityWindow[] = selected.windows
    .map((window) => {
      const settings = evaluated.map((s) => ({
        buffer: s.buffer,
        proximity: s.proximity,
        score: s.windows[window.index].score,
        rank: s.windows[window.index].rank,
      }));
      return {
        ...window,
        settings,
        topSettings: settings.filter(
          (s) => s.rank <= topCutoff && s.score > EPSILON,
        ).length,
        minRank: Math.min(...settings.map((s) => s.rank)),
        maxRank: Math.max(...settings.map((s) => s.rank)),
      };
    })
    .sort(compare);
  const suggestions: OpportunityWindow[] = [];
  for (const candidate of candidates) {
    if (candidate.score <= EPSILON || !candidate.nearby) continue;
    if (
      suggestions.some(
        (s) =>
          s.day === candidate.day &&
          s.start < candidate.end &&
          s.end > candidate.start,
      )
    )
      continue;
    suggestions.push(candidate);
    if (suggestions.length >= (options.limit ?? 5)) break;
  }
  return {
    candidates,
    suggestions,
    coverage,
    candidateCount: slots.length,
    topCutoff,
    maxActivity: selected.maxActivity,
    maxConflicts: selected.maxConflicts,
  };
}

function compare(
  a: Pick<
    OpportunityWindow,
    "score" | "nearby" | "conflicts" | "day" | "start"
  >,
  b: Pick<
    OpportunityWindow,
    "score" | "nearby" | "conflicts" | "day" | "start"
  >,
) {
  return (
    b.score - a.score ||
    b.nearby - a.nearby ||
    a.conflicts - b.conflicts ||
    a.day - b.day ||
    a.start - b.start
  );
}
