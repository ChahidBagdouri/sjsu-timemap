import type { Dataset, Meeting, Metric, Place, Section } from "./types";
export const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const MINUTES = 1440;
const DAY_MS = 86400000;
export function dateNumber(iso: string) {
  return Date.parse(`${iso}T00:00:00Z`);
}
export function dateISO(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}
export function monday(iso: string) {
  const ms = dateNumber(iso);
  return dateISO(ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY_MS);
}
export function addDays(iso: string, days: number) {
  return dateISO(dateNumber(iso) + days * DAY_MS);
}
export function clock(value: number) {
  const h = Math.floor(value / 60);
  return `${h % 12 || 12}:${String(value % 60).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
export function matchesPlace(m: Meeting, place: Place) {
  const loc = m.location.toUpperCase().replace(/\s/g, "");
  const online = loc.includes("ONLINE") || loc === "HYBRID";
  return (
    place === "all" ||
    (place === "online"
      ? online
      : !online && !["", "TBA", "OFFCAMPUS"].includes(loc))
  );
}
export function weight(section: Section, metric: Metric): number | null {
  if (metric === "sections") return 1;
  if (!section.weightingEligible || section.combinedFlag) return null;
  return section[metric === "enrollment" ? "enrollment" : "capacity"];
}
export function mergeIntervals(
  intervals: [number, number][],
): [number, number][] {
  const merged: [number, number][] = [];
  for (const [a, b] of [...intervals].sort((x, y) => x[0] - y[0])) {
    const last = merged.at(-1);
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  return merged;
}
export type View = {
  mode: "semester" | "week";
  week: string;
  metric: Metric;
  place: Place;
};
export type Concentration = {
  minutes: Float64Array[];
  starts: Float64Array[];
  ends: Float64Array[];
  denominators: number[];
  timedSections: number;
  weightedSections: number;
  unknownTimeSections: number;
  peak: number;
};
export function aggregate(
  sections: Section[],
  term: Dataset["term"],
  view: View,
): Concentration {
  const start = view.mode === "semester" ? term.startDate : monday(view.week);
  const end = view.mode === "semester" ? term.endDate : addDays(start, 6);
  const dates: string[][] = Array.from({ length: 7 }, () => []);
  for (let ms = dateNumber(start); ms <= dateNumber(end); ms += DAY_MS)
    dates[(new Date(ms).getUTCDay() + 6) % 7].push(dateISO(ms));
  const denominators = dates.map((d) => d.length);
  const diff = dates.map(() => new Float64Array(MINUTES + 1));
  const starts = dates.map(() => new Float64Array(MINUTES + 1));
  const ends = dates.map(() => new Float64Array(MINUTES + 1));
  let timedSections = 0,
    weightedSections = 0,
    unknownTimeSections = 0;
  for (const section of sections) {
    if (section.status !== "active") continue;
    const timed = section.meetings.filter((m) => m.kind === "scheduled");
    if (!timed.length) {
      unknownTimeSections++;
      continue;
    }
    const scheduled = timed.filter((m) => matchesPlace(m, view.place));
    if (!scheduled.length) continue;
    const active = scheduled.some((m) =>
      m.days.some((d) =>
        dates[d].some((date) => date >= m.startDate && date <= m.endDate),
      ),
    );
    if (!active) continue;
    timedSections++;
    const value = weight(section, view.metric);
    if (value === null) continue;
    weightedSections++;
    for (let day = 0; day < 7; day++)
      for (const date of dates[day]) {
        const intervals = scheduled
          .filter(
            (m) =>
              m.days.includes(day) && date >= m.startDate && date <= m.endDate,
          )
          .map((m) => [m.startMinute!, m.endMinute!] as [number, number]);
        for (const [a, b] of mergeIntervals(intervals)) {
          const contribution = value / denominators[day];
          diff[day][a] += contribution;
          diff[day][b] -= contribution;
          starts[day][a] += contribution;
          ends[day][b] += contribution;
        }
      }
  }
  let peak = 0;
  const minutes = diff.map((row) => {
    const result = new Float64Array(MINUTES);
    let current = 0;
    for (let i = 0; i < MINUTES; i++) {
      current += row[i];
      result[i] = Math.abs(current) < 1e-8 ? 0 : current;
      peak = Math.max(peak, result[i]);
    }
    return result;
  });
  return {
    minutes,
    starts,
    ends,
    denominators,
    timedSections,
    weightedSections,
    unknownTimeSections,
    peak,
  };
}
export function average(row: Float64Array, start: number, end: number) {
  if (end <= start) return 0;
  let total = 0;
  for (let t = start; t < end; t++) total += row[t] || 0;
  return total / (end - start);
}
export function binGrid(
  result: Concentration,
  start: number,
  end: number,
  size: number,
) {
  return result.minutes.map((row) =>
    Array.from({ length: Math.ceil((end - start) / size) }, (_, i) =>
      average(row, start + i * size, Math.min(end, start + (i + 1) * size)),
    ),
  );
}
export function boundaries(rows: Float64Array[], limit = 7) {
  const values = Array.from({ length: MINUTES }, (_, minute) => ({
    minute,
    value: rows.reduce((n, row) => n + row[minute], 0),
  }));
  return values
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}
export type WindowScore = {
  day: number;
  start: number;
  end: number;
  average: number;
  peak: number;
};
export function eventWindows(
  result: Concentration,
  duration: number,
  start = 9 * 60,
  end = 20 * 60,
  buffer = 0,
): WindowScore[] {
  const candidates: WindowScore[] = [];
  for (let day = 0; day < 5; day++) {
    if (!result.denominators[day]) continue;
    for (let t = start; t + duration <= end; t += 15) {
      const from = Math.max(0, t - buffer),
        to = Math.min(MINUTES, t + duration + buffer);
      let peak = 0;
      for (let minute = from; minute < to; minute++)
        peak = Math.max(peak, result.minutes[day][minute]);
      candidates.push({
        day,
        start: t,
        end: t + duration,
        average: average(result.minutes[day], from, to),
        peak,
      });
    }
  }
  candidates.sort(
    (a, b) =>
      a.average - b.average ||
      a.peak - b.peak ||
      a.day - b.day ||
      a.start - b.start,
  );
  const chosen: WindowScore[] = [];
  for (const candidate of candidates) {
    if (
      !chosen.some(
        (x) =>
          x.day === candidate.day &&
          Math.min(x.end, candidate.end) > Math.max(x.start, candidate.start),
      )
    )
      chosen.push(candidate);
    if (chosen.length === 5) break;
  }
  return chosen;
}
export function contributors(
  sections: Section[],
  day: number,
  start: number,
  end: number,
  term: Dataset["term"],
  view: View,
) {
  const from = view.mode === "semester" ? term.startDate : monday(view.week);
  const to = view.mode === "semester" ? term.endDate : addDays(from, 6);
  return sections.filter(
    (s) =>
      s.status === "active" &&
      s.meetings.some(
        (m) =>
          m.kind === "scheduled" &&
          matchesPlace(m, view.place) &&
          m.days.includes(day) &&
          m.startMinute! < end &&
          m.endMinute! > start &&
          m.startDate <= to &&
          m.endDate >= from &&
          (() => {
            let first = dateNumber(m.startDate > from ? m.startDate : from);
            const dow = (new Date(first).getUTCDay() + 6) % 7;
            first += ((day - dow + 7) % 7) * DAY_MS;
            return first <= dateNumber(m.endDate < to ? m.endDate : to);
          })(),
      ),
  );
}
