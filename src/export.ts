import type { Metric } from "./types";
import { clock, DAYS } from "./engine";
import type { Dataset } from "./types";
import type { OpportunityOptions, OpportunityRanking } from "./opportunities";
const COLORS = [
  "#f0f4f8",
  "#d9e8f2",
  "#b2d0e2",
  "#7aacc9",
  "#4586a8",
  "#216184",
  "#123e5a",
];
function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function downloadOpportunitiesCsv(
  ranking: OpportunityRanking,
  data: Dataset,
  period: string,
  options: OpportunityOptions,
) {
  const rows: (string | number)[][] = [
    [
      "term",
      "period",
      "weekday",
      "start_pacific",
      "end_pacific",
      "duration_minutes",
      "travel_buffer_each_side",
      "nearby_window_minutes",
      "relative_opportunity_score_not_attendance",
      "rank",
      "candidate_slots",
      "nearby_activity_units",
      "ending_activity_units",
      "starting_activity_units",
      "conflicting_enrollments",
      "relative_activity",
      "relative_conflicts",
      "top_decile_settings",
      "settings_tested",
      "best_rank",
      "worst_rank",
      "eligible_weekday_sections",
      "total_weekday_sections",
      "view_url",
      "snapshot_generated_at",
      "source_download_times",
    ],
  ];
  for (const w of ranking.candidates)
    rows.push([
      data.term.label,
      period,
      DAYS[w.day],
      clock(w.start),
      clock(w.end),
      options.duration,
      options.buffer,
      options.proximity,
      w.score,
      w.rank,
      ranking.candidateCount,
      w.nearby,
      w.ending,
      w.starting,
      w.conflicts,
      w.normalizedActivity,
      w.normalizedConflicts,
      w.topSettings,
      w.settings.length,
      w.minRank,
      w.maxRank,
      ranking.coverage.eligibleSections,
      ranking.coverage.timedSections,
      window.location.href,
      data.generatedAt,
      data.sources.map((s) => s.name + ": " + s.observedAt).join("; "),
    ]);
  const quote = (s: string | number) =>
    '"' + String(s).replaceAll('"', '""') + '"';
  save(
    new Blob([rows.map((row) => row.map(quote).join(",")).join("\r\n")], {
      type: "text/csv;charset=utf-8",
    }),
    "sjsu-timemap-" + data.term.id + "-opportunities.csv",
  );
}
export function downloadCsv(
  grid: number[][],
  start: number,
  resolution: number,
  term: string,
  metric: Metric,
  period: string,
) {
  const quote = (s: string | number) => `"${String(s).replaceAll('"', '""')}"`;
  const rows: [string, ...(string | number)[]][] = [
    [
      "term",
      "period",
      "weekday",
      "start_pacific",
      "end_pacific",
      "metric",
      "average_simultaneous_load",
    ],
  ];
  grid.forEach((row, day) =>
    row.forEach((value, i) =>
      rows.push([
        term,
        period,
        DAYS[day],
        clock(start + i * resolution),
        clock(Math.min(1320, start + (i + 1) * resolution)),
        metric,
        value,
      ]),
    ),
  );
  save(
    new Blob([rows.map((r) => r.map(quote).join(",")).join("\r\n")], {
      type: "text/csv;charset=utf-8",
    }),
    `sjsu-timemap-${term.toLowerCase().replaceAll(" ", "-")}-${metric}.csv`,
  );
}
export function downloadPng(
  grid: number[][],
  start: number,
  resolution: number,
  term: string,
  metric: Metric,
  period: string,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 1700;
  const c = canvas.getContext("2d");
  if (!c) return;
  c.fillStyle = "#f7f9fc";
  c.fillRect(0, 0, 1600, 1700);
  c.fillStyle = "#112c46";
  c.fillRect(0, 0, 1600, 180);
  c.font = "bold 50px system-ui";
  c.fillStyle = "#fff";
  c.fillText("SJSU TimeMap", 70, 90);
  c.font = "26px system-ui";
  c.fillStyle = "#cedce7";
  c.fillText(`${term} · ${period} · ${metric}`, 70, 140);
  const left = 150,
    top = 280,
    width = 1360,
    height = 1200,
    col = width / 7,
    rows = grid[0]?.length || 1,
    rowHeight = height / rows,
    max = Math.max(0, ...grid.flat());
  c.fillStyle = "#112c46";
  c.font = "bold 24px system-ui";
  DAYS.forEach((d, i) => c.fillText(d.slice(0, 3), left + i * col + 65, 245));
  grid.forEach((values, day) =>
    values.forEach((value, i) => {
      c.fillStyle =
        COLORS[
          value && max
            ? Math.max(1, Math.min(6, Math.ceil((value / max) * 6)))
            : 0
        ];
      c.fillRect(
        left + day * col,
        top + i * rowHeight,
        col - 5,
        Math.max(1, rowHeight - 1),
      );
    }),
  );
  c.font = "20px system-ui";
  c.fillStyle = "#526477";
  for (let m = start; m <= 1320; m += 60)
    c.fillText(
      clock(m).replace(":00", ""),
      25,
      top + ((m - start) / (1320 - start)) * height + 6,
    );
  c.font = "22px system-ui";
  c.fillText(
    `Average simultaneous load · 0 to ${max.toFixed(1)} · Pacific time`,
    left,
    1540,
  );
  c.font = "20px system-ui";
  c.fillText(
    "Source: SJSU public schedules and enrollment dashboard. Coverage follows the selected view.",
    left,
    1590,
  );
  c.fillText(
    "Planned weekly patterns; holidays, exceptional meeting dates, and finals are not modeled.",
    left,
    1625,
  );
  canvas.toBlob((b) => {
    if (b)
      save(b, `sjsu-timemap-${term.toLowerCase().replaceAll(" ", "-")}.png`);
  }, "image/png");
}
