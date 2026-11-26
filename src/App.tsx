import { useEffect, useMemo, useRef, useState } from "react";
import type { Dataset, Manifest, Metric, Place } from "./types";
import {
  addDays,
  aggregate,
  average,
  binGrid,
  boundaries,
  clock,
  contributors,
  DAY_SHORT,
  DAYS,
  eventWindows,
  monday,
  type View,
} from "./engine";
import { downloadCsv, downloadPng } from "./export";

const BASE = import.meta.env.BASE_URL;
const REPO = "https://github.com/ChahidBagdouri/sjsu-timemap";
const START = 7 * 60,
  END = 22 * 60;
const format = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 1 });
const niceDate = (s: string) =>
  new Date(`${s}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
const COLORS = [
  "#f0f4f8",
  "#d9e8f2",
  "#b2d0e2",
  "#7aacc9",
  "#4586a8",
  "#216184",
  "#123e5a",
];
export function heatColor(value: number, max: number) {
  if (!value || !max) return COLORS[0];
  return COLORS[Math.max(1, Math.min(6, Math.ceil((value / max) * 6)))];
}
const unit = (metric: Metric) =>
  metric === "sections"
    ? "sections"
    : metric === "enrollment"
      ? "enrolled students"
      : "seats";
async function json<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Data request failed (${r.status}).`);
  return r.json();
}
function defaultWeek(data: Dataset) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
  }).format(new Date());
  return monday(
    today >= data.term.startDate && today <= data.term.endDate
      ? today
      : addDays(data.term.startDate, 7),
  );
}
function Mark() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
      <rect x="1" y="1" width="8" height="8" rx="2" fill="#f7bd48" />
      <rect
        x="11"
        y="1"
        width="8"
        height="8"
        rx="2"
        fill="#f7bd48"
        opacity=".45"
      />
      <rect
        x="21"
        y="1"
        width="8"
        height="8"
        rx="2"
        fill="#fff"
        opacity=".15"
      />
      <rect
        x="1"
        y="11"
        width="8"
        height="8"
        rx="2"
        fill="#f7bd48"
        opacity=".65"
      />
      <rect
        x="11"
        y="11"
        width="8"
        height="8"
        rx="2"
        fill="#fff"
        opacity=".3"
      />
      <rect x="21" y="11" width="8" height="8" rx="2" fill="#f7bd48" />
      <rect x="1" y="21" width="8" height="8" rx="2" fill="#fff" opacity=".2" />
      <rect x="11" y="21" width="8" height="8" rx="2" fill="#f7bd48" />
      <rect
        x="21"
        y="21"
        width="8"
        height="8"
        rx="2"
        fill="#f7bd48"
        opacity=".6"
      />
    </svg>
  );
}
export default function App() {
  const initial = useMemo(
    () => new URLSearchParams(window.location.search),
    [],
  );
  const [manifest, setManifest] = useState<Manifest | null>(null),
    [data, setData] = useState<Dataset | null>(null);
  const [term, setTerm] = useState(initial.get("term") || ""),
    [metric, setMetric] = useState<Metric>(
      ["enrollment", "capacity"].includes(initial.get("metric") || "")
        ? (initial.get("metric") as Metric)
        : "sections",
    );
  const [subjects, setSubjects] = useState<string[]>(
    (initial.get("subjects") || "").split(",").filter(Boolean),
  );
  const [subjectSearch, setSubjectSearch] = useState(""),
    [place, setPlace] = useState<Place>(
      ["campus", "online"].includes(initial.get("place") || "")
        ? (initial.get("place") as Place)
        : "all",
    );
  const [mode, setMode] = useState<"semester" | "week">(
      initial.get("week") ? "week" : "semester",
    ),
    [week, setWeek] = useState(initial.get("week") || "");
  const [resolution, setResolution] = useState(
      [5, 15, 30].includes(Number(initial.get("interval")))
        ? Number(initial.get("interval"))
        : 15,
    ),
    [duration, setDuration] = useState(60),
    [buffer, setBuffer] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{
      day: number;
      start: number;
      end: number;
    } | null>(null),
    [detailSearch, setDetailSearch] = useState(""),
    [revision, setRevision] = useState(0);
  const [modality, setModality] = useState(initial.get("modality") || "all"),
    [college, setCollege] = useState(initial.get("college") || "all");
  const lastFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    let live = true;
    json<Manifest>(`${BASE}data/manifest.json`)
      .then((m) => {
        if (!live) return;
        setManifest(m);
        setTerm((t) =>
          m.terms.some((x) => x.id === t) ? t : m.terms[0]?.id || "",
        );
      })
      .catch((e) => {
        if (live) {
          setError(String(e));
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, [revision]);
  useEffect(() => {
    if (!manifest || !term) return;
    let live = true;
    const info = manifest.terms.find((t) => t.id === term);
    if (!info) return;
    setLoading(true);
    setError("");
    setData(null);
    setSelected(null);
    json<Dataset>(`${BASE}data/${info.file}?v=${info.sha256}`)
      .then((d) => {
        if (!live) return;
        if (d.schemaVersion !== 1)
          throw new Error("This dataset needs a newer app version.");
        setData(d);
        setWeek((w) => w || defaultWeek(d));
        setLoading(false);
      })
      .catch((e) => {
        if (live) {
          setError(String(e));
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, [manifest, term]);
  useEffect(() => {
    const p = new URLSearchParams();
    if (term) p.set("term", term);
    if (metric !== "sections") p.set("metric", metric);
    if (subjects.length) p.set("subjects", subjects.join(","));
    if (place !== "all") p.set("place", place);
    if (mode === "week" && week) p.set("week", week);
    if (modality !== "all") p.set("modality", modality);
    if (college !== "all") p.set("college", college);
    if (resolution !== 15) p.set("interval", String(resolution));
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${p.size ? "?" + p : ""}`,
    );
  }, [
    term,
    metric,
    subjects,
    place,
    mode,
    week,
    modality,
    college,
    resolution,
  ]);
  useEffect(() => {
    const timer = window.setInterval(
      () =>
        json<Manifest>(`${BASE}data/manifest.json`)
          .then((m) => {
            if (manifest && m.generatedAt !== manifest.generatedAt)
              setNotice(
                "A new data snapshot is available. Reload data to use it.",
              );
          })
          .catch(() => {}),
      300000,
    );
    return () => window.clearInterval(timer);
  }, [manifest]);
  useEffect(() => {
    if (!selected) {
      lastFocus.current?.focus();
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);
  const subjectCounts = useMemo(() => {
    const counts = new Map<string, number>();
    data?.sections
      .filter((s) => s.status === "active")
      .forEach((s) => counts.set(s.subject, (counts.get(s.subject) || 0) + 1));
    return [...counts].sort((a, b) => a[0].localeCompare(b[0]));
  }, [data]);
  const filtered = useMemo(
    () =>
      data?.sections.filter(
        (s) =>
          s.status === "active" &&
          (!subjects.length || subjects.includes(s.subject)) &&
          (modality === "all" || s.modality === modality) &&
          (college === "all" || s.college === college),
      ) || [],
    [data, subjects, modality, college],
  );
  const view: View = useMemo(
    () => ({
      mode,
      week: week || data?.term.startDate || "2026-08-19",
      metric,
      place,
    }),
    [mode, week, metric, place, data],
  );
  const result = useMemo(
    () => (data ? aggregate(filtered, data.term, view) : null),
    [data, filtered, view],
  );
  const grid = useMemo(
    () => (result ? binGrid(result, START, END, resolution) : []),
    [result, resolution],
  );
  const max = useMemo(() => Math.max(0, ...grid.flat()), [grid]);
  const starts = useMemo(
    () => (result ? boundaries(result.starts) : []),
    [result],
  );
  const ends = useMemo(() => (result ? boundaries(result.ends) : []), [result]);
  const windows = useMemo(
    () =>
      result
        ? eventWindows(result, duration, 9 * 60, 20 * 60, buffer ? 15 : 0)
        : [],
    [result, duration, buffer],
  );
  const detail = useMemo(
    () =>
      selected && data
        ? contributors(
            filtered,
            selected.day,
            selected.start,
            selected.end,
            data.term,
            view,
          ).filter((s) =>
            `${s.course} ${s.title} ${s.instructor}`
              .toLowerCase()
              .includes(detailSearch.toLowerCase()),
          )
        : [],
    [selected, data, filtered, view, detailSearch],
  );
  const peak = useMemo(() => {
    let value = 0,
      day = 0,
      minute = 0;
    grid.forEach((r, d) =>
      r.forEach((v, i) => {
        if (v > value) {
          value = v;
          day = d;
          minute = START + i * resolution;
        }
      }),
    );
    return { value, day, minute };
  }, [grid, resolution]);
  const knownCoverage =
    result && result.timedSections
      ? result.weightedSections / result.timedSections
      : 0;
  const availableWeights = Boolean(data?.quality.weightableSections);
  const metricUnavailable = metric !== "sections" && !availableWeights;
  const colleges = useMemo(
    () =>
      [
        ...new Set(
          data?.sections
            .map((s) => s.college)
            .filter((s): s is string => Boolean(s)) || [],
        ),
      ].sort(),
    [data],
  );
  const timeLabel =
    mode === "semester"
      ? "Semester weekday average"
      : `Week of ${niceDate(monday(view.week))}`;
  function selectCell(day: number, start: number, end: number) {
    lastFocus.current = document.activeElement as HTMLElement;
    setSelected({ day, start, end });
    setDetailSearch("");
  }
  function toggleSubject(value: string) {
    setSubjects((s) =>
      s.includes(value) ? s.filter((x) => x !== value) : [...s, value],
    );
  }
  async function share() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setNotice("Link copied with your selected filters and time period.");
    } catch {
      setNotice("Copy the address from your browser to share this view.");
    }
  }
  function keyMove(
    e: React.KeyboardEvent<HTMLButtonElement>,
    day: number,
    index: number,
  ) {
    const moves: Record<string, [number, number]> = {
      ArrowRight: [1, 0],
      ArrowLeft: [-1, 0],
      ArrowDown: [0, 1],
      ArrowUp: [0, -1],
    };
    if (!moves[e.key]) return;
    e.preventDefault();
    const [d, r] = moves[e.key];
    document
      .querySelector<HTMLButtonElement>(
        `[data-cell="${Math.max(0, Math.min(6, day + d))}-${Math.max(0, Math.min(grid[0].length - 1, index + r))}"]`,
      )
      ?.focus();
  }
  return (
    <>
      <a className="skip-link" href="#heatmap">
        Skip to heatmap
      </a>
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href={BASE}>
            <Mark />
            <span>
              SJSU <strong>TimeMap</strong>
            </span>
            <span className="alpha-tag">EARLY ACCESS</span>
          </a>
          <nav aria-label="Main">
            <a href="#methodology">How it works</a>
            <a href={REPO} target="_blank" rel="noreferrer">
              GitHub <span aria-hidden="true">↗</span>
            </a>
          </nav>
        </div>
      </header>
      <main className="page">
        <section className="intro">
          <div>
            <p className="eyebrow">A BETTER TIME TO GET TOGETHER</p>
            <h1>See when SJSU is in class.</h1>
            <p className="intro-copy">
              Explore class patterns across the week. Plan your next club event
              with a clearer picture.
            </p>
          </div>
          <button className="button secondary share" onClick={share}>
            Copy view link
          </button>
        </section>
        {notice && (
          <div className="notice" role="status">
            {notice}
            <button
              onClick={() => {
                setNotice("");
                setRevision((n) => n + 1);
              }}
            >
              Reload data
            </button>
            <button aria-label="Dismiss notice" onClick={() => setNotice("")}>
              ×
            </button>
          </div>
        )}
        {error && (
          <div className="error" role="alert">
            <strong>We couldn’t load the schedule.</strong>
            <span>{error}</span>
            <button
              className="button"
              onClick={() => setRevision((n) => n + 1)}
            >
              Try again
            </button>
          </div>
        )}
        <div className="workspace">
          <aside className="filters">
            <div className="filter-heading">
              <h2>Your view</h2>
              <button
                className="text-button"
                onClick={() => {
                  setSubjects([]);
                  setPlace("all");
                  setCollege("all");
                  setModality("all");
                }}
              >
                Reset filters
              </button>
            </div>
            <label className="field">
              Semester
              <select
                value={term}
                onChange={(e) => {
                  setTerm(e.target.value);
                  setWeek("");
                  setCollege("all");
                }}
                aria-label="Semester"
              >
                {manifest?.terms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Time period
              <select
                aria-label="Time period"
                value={mode}
                onChange={(e) => setMode(e.target.value as "semester" | "week")}
              >
                <option value="semester">Semester average</option>
                <option value="week">Specific week</option>
              </select>
            </label>
            {mode === "week" && (
              <label className="field">
                Any date in the week
                <input
                  type="date"
                  value={week}
                  onChange={(e) => {
                    if (e.target.value) setWeek(monday(e.target.value));
                  }}
                />
              </label>
            )}
            <label className="field">
              Meeting location
              <select
                aria-label="Meeting location"
                value={place}
                onChange={(e) => setPlace(e.target.value as Place)}
              >
                <option value="all">All scheduled meetings</option>
                <option value="campus">Known on-campus rooms</option>
                <option value="online">Online meetings</option>
              </select>
            </label>
            <label className="field">
              Instruction mode
              <select
                aria-label="Instruction mode"
                value={modality}
                onChange={(e) => setModality(e.target.value)}
              >
                <option value="all">All instruction modes</option>
                {[...new Set(data?.sections.map((s) => s.modality) || [])]
                  .sort()
                  .map((s) => (
                    <option key={s}>{s}</option>
                  ))}
              </select>
            </label>
            {colleges.length > 0 && (
              <label className="field">
                College
                <select
                  aria-label="College"
                  value={college}
                  onChange={(e) => setCollege(e.target.value)}
                >
                  <option value="all">All colleges</option>
                  {colleges.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            )}
            <div className="subject-heading">
              <label htmlFor="subject-search">Subjects</label>
              <span>
                {subjects.length
                  ? `${subjects.length} selected`
                  : "All selected"}
              </span>
            </div>
            <input
              id="subject-search"
              className="subject-search"
              type="search"
              placeholder="Find a subject, e.g. CS"
              value={subjectSearch}
              onChange={(e) => setSubjectSearch(e.target.value)}
            />
            <div className="subject-list">
              {subjectCounts
                .filter(([s]) =>
                  s.toLowerCase().includes(subjectSearch.toLowerCase()),
                )
                .map(([s, n]) => (
                  <label className="subject" key={s}>
                    <input
                      type="checkbox"
                      checked={subjects.includes(s)}
                      onChange={() => toggleSubject(s)}
                    />
                    <span>{s}</span>
                    <span className="subject-count">{n}</span>
                  </label>
                ))}
            </div>
            <p className="helper">
              Choose subjects to focus on. With none selected, the map includes
              every subject.
            </p>
            <div className="sidebar-note">
              <span className="small-map" aria-hidden="true">
                â–¦
              </span>
              <p>
                Built for clubs.
                <br />
                <strong>Open to everyone.</strong>
              </p>
            </div>
          </aside>
          <div className="content" aria-busy={loading}>
            <div className="summary-row">
              <article className="summary">
                <span>Scheduled sections</span>
                <strong>
                  {loading ? "—" : format(result?.timedSections || 0)}
                </strong>
                <small>In your selected view</small>
              </article>
              <article className="summary">
                <span>Peak interval load</span>
                <strong>
                  {loading || metricUnavailable ? "—" : format(peak.value)}
                  <em>{unit(metric)}</em>
                </strong>
                <small>
                  {peak.value > 0
                    ? `${DAY_SHORT[peak.day]}, ${clock(peak.minute)}`
                    : "No scheduled load in this view"}
                </small>
              </article>
              <article className="summary">
                <span>Enrollment matched</span>
                <strong>
                  {loading
                    ? "—"
                    : `${data?.quality.joinCoverage === 1 ? "100" : ((data?.quality.joinCoverage || 0) * 100).toFixed(2)}%`}
                </strong>
                <small>
                  {data
                    ? `${format(data.quality.enrollmentMatches)} of ${format(data.quality.sections)} sections`
                    : "Checking source coverage"}
                </small>
              </article>
            </div>
            <div className="main-grid">
              <section
                className="panel heatmap-panel"
                id="heatmap"
                aria-labelledby="heatmap-title"
              >
                <div className="panel-heading">
                  <div>
                    <h2 id="heatmap-title">The shape of your week</h2>
                    <p>
                      {data?.term.label || "Loading semester"} · {timeLabel}
                    </p>
                  </div>
                  <label className="resolution">
                    <span>Intervals</span>
                    <select
                      aria-label="Intervals"
                      value={resolution}
                      onChange={(e) => setResolution(Number(e.target.value))}
                    >
                      <option value={5}>5 min</option>
                      <option value={15}>15 min</option>
                      <option value={30}>30 min</option>
                    </select>
                  </label>
                </div>
                <div
                  className="metric-tabs"
                  role="group"
                  aria-label="Heatmap metric"
                >
                  {(
                    [
                      ["sections", "Class sections"],
                      ["enrollment", "Enrolled students"],
                      ["capacity", "Seat capacity"],
                    ] as [Metric, string][]
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      className={metric === v ? "active" : ""}
                      aria-pressed={metric === v}
                      onClick={() => setMetric(v)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {metric !== "sections" && (
                  <p className="coverage-note">
                    {metricUnavailable
                      ? "Enrollment data is not available for this snapshot."
                      : `${Math.round(knownCoverage * 100)}% of scheduled sections contribute to this view. Unmatched and combined sections are omitted.`}
                  </p>
                )}
                {loading ? (
                  <div className="chart-state">
                    <div className="spinner" />
                    <p>Mapping your semester…</p>
                  </div>
                ) : metricUnavailable ? (
                  <div className="chart-state">
                    <Mark />
                    <h3>Enrollment counts are still being connected.</h3>
                    <p>
                      You can explore the complete class-section heatmap now.
                    </p>
                    <button
                      className="button"
                      onClick={() => setMetric("sections")}
                    >
                      View class sections
                    </button>
                  </div>
                ) : (
                  <>
                    <div
                      className="heatmap"
                      role="group"
                      aria-label={`${timeLabel}, ${unit(metric)}. Use arrow keys within the grid and Enter for class details.`}
                    >
                      <div className="day-axis">
                        <span />
                        <>
                          {DAYS.map((d, i) => (
                            <span className={i > 4 ? "weekend" : ""} key={d}>
                              {DAY_SHORT[i]}
                            </span>
                          ))}
                        </>
                      </div>
                      <div
                        className="chart-body"
                        style={
                          {
                            "--rows": grid[0]?.length || 60,
                          } as React.CSSProperties
                        }
                      >
                        <div className="time-axis">
                          {Array.from(
                            { length: (END - START) / 60 + 1 },
                            (_, i) => (
                              <span
                                key={i}
                                style={{
                                  top: `${(i / ((END - START) / 60)) * 100}%`,
                                }}
                              >
                                {clock(START + i * 60).replace(":00", "")}
                              </span>
                            ),
                          )}
                        </div>
                        {grid.map((row, day) => (
                          <div
                            className={`day-column ${day > 4 ? "weekend" : ""}`}
                            key={day}
                          >
                            {row.map((value, index) => (
                              <button
                                key={index}
                                data-cell={`${day}-${index}`}
                                tabIndex={day === 0 && index === 0 ? 0 : -1}
                                className={`heat-cell ${(START + index * resolution) % 60 === 0 ? "hour-start" : ""} ${selected?.day === day && selected?.start === START + index * resolution ? "selected" : ""}`}
                                style={{ background: heatColor(value, max) }}
                                aria-label={`${DAYS[day]}, ${clock(START + index * resolution)} to ${clock(Math.min(END, START + (index + 1) * resolution))}: ${format(value)} ${unit(metric)} on average`}
                                title={`${DAY_SHORT[day]} ${clock(START + index * resolution)} · ${format(value)} ${unit(metric)}`}
                                onKeyDown={(e) => keyMove(e, day, index)}
                                onClick={() =>
                                  selectCell(
                                    day,
                                    START + index * resolution,
                                    Math.min(
                                      END,
                                      START + (index + 1) * resolution,
                                    ),
                                  )
                                }
                              />
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="chart-footer">
                      <span>Lower load</span>
                      <div className="legend">
                        {COLORS.map((c) => (
                          <i key={c} style={{ background: c }} />
                        ))}
                      </div>
                      <span>Higher load</span>
                      <span className="legend-max">
                        0–{format(max)} {unit(metric)}
                      </span>
                    </div>
                    <p className="chart-caption">
                      Each cell shows the average simultaneous load during its
                      interval. Select a cell to explore the classes behind it.
                    </p>
                  </>
                )}
                <div className="export-row">
                  <span>
                    {subjects.length ? subjects.join(", ") : "All subjects"} ·
                    Pacific time
                  </span>
                  <div>
                    <button
                      className="text-button"
                      disabled={!result || loading || metricUnavailable}
                      onClick={() =>
                        data &&
                        downloadCsv(
                          grid,
                          START,
                          resolution,
                          data.term.label,
                          metric,
                          timeLabel,
                        )
                      }
                    >
                      Export CSV
                    </button>
                    <button
                      className="text-button"
                      disabled={!result || loading || metricUnavailable}
                      onClick={() =>
                        data &&
                        downloadPng(
                          grid,
                          START,
                          resolution,
                          data.term.label,
                          metric,
                          timeLabel,
                        )
                      }
                    >
                      Export PNG
                    </button>
                  </div>
                </div>
              </section>
              <aside className="right-column">
                <section className="panel event-panel">
                  <div className="event-icon" aria-hidden="true">
                    â—·
                  </div>
                  <p className="eyebrow">MAKE TIME TO MEET</p>
                  <h2>Find a quieter window</h2>
                  <p className="muted">
                    Compare weekday options between 9 AM and 8 PM using your
                    current filters.
                  </p>
                  <label className="field">
                    Event length
                    <select
                      aria-label="Event length"
                      value={duration}
                      onChange={(e) => setDuration(Number(e.target.value))}
                    >
                      {[30, 60, 90, 120].map((n) => (
                        <option key={n} value={n}>
                          {n} minutes
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="buffer">
                    <input
                      type="checkbox"
                      checked={buffer}
                      onChange={(e) => setBuffer(e.target.checked)}
                    />{" "}
                    Include a 15-minute transition
                  </label>
                  {result?.timedSections && !metricUnavailable ? (
                    <ol className="window-list">
                      {windows.map((w) => (
                        <li key={`${w.day}-${w.start}`}>
                          <button
                            onClick={() => selectCell(w.day, w.start, w.end)}
                          >
                            <span className="window-day">
                              {DAY_SHORT[w.day]}
                            </span>
                            <span>
                              <strong>
                                {clock(w.start)}–{clock(w.end)}
                              </strong>
                              <small>
                                {format(w.average)} {unit(metric)} avg ·{" "}
                                {format(w.peak)} peak
                              </small>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="empty-copy">
                      Choose a view with scheduled classes to compare event
                      windows.
                    </p>
                  )}
                  <p className="helper">
                    Lower scheduled load can mean fewer class conflicts. It
                    doesn’t measure club members’ availability or campus
                    attendance.
                  </p>
                </section>
                <section className="data-note">
                  <div>
                    <span className="data-badge">OFFICIAL SOURCE DATA</span>
                    <h3>A snapshot, clearly labeled.</h3>
                  </div>
                  <p>
                    {data
                      ? `Schedule downloaded ${new Date(data.sources[0].observedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" })}.`
                      : "Loading source information."}{" "}
                    SJSU refreshes its public data nightly.
                  </p>
                  <a href="#methodology">View coverage & methodology</a>
                </section>
              </aside>
            </div>
            <div className="patterns-grid">
              {[
                [
                  "Common class starts",
                  starts,
                  "When scheduled commitments begin",
                ],
                [
                  "Common class endings",
                  ends,
                  "When scheduled commitments finish",
                ],
              ].map(([title, values, subtitle]) => (
                <section className="panel pattern-panel" key={title as string}>
                  <h2>{title as string}</h2>
                  <p>{subtitle as string}</p>
                  <div className="bars">
                    {(values as { minute: number; value: number }[]).map(
                      (v) => (
                        <div className="bar-row" key={v.minute}>
                          <span>{clock(v.minute)}</span>
                          <div>
                            <i
                              style={{
                                width: `${(v.value / Math.max(1, ...(values as { value: number }[]).map((x) => x.value))) * 100}%`,
                              }}
                            />
                          </div>
                          <strong>{format(v.value)}</strong>
                        </div>
                      ),
                    )}
                  </div>
                  <small>
                    Counts follow your selected metric and time period.
                  </small>
                </section>
              ))}
            </div>
          </div>
        </div>
        <section className="methodology panel" id="methodology">
          <div>
            <p className="eyebrow">UNDERSTAND THE MAP</p>
            <h2>Useful patterns. Honest limits.</h2>
            <p>
              Class sections count once at any instant, including their labs and
              other scheduled components. Enrollment weighting uses reported
              section counts; overlapping representations of the same section
              are merged.
            </p>
            <p>
              Semester averages account for each meeting’s published date range.
              They include the published weekly patterns; holidays, irregular
              meeting exceptions, and finals are not yet applied. Classes with
              several patterns may have dates that the public table doesn’t
              distinguish.
            </p>
            <p>
              Combined sections are omitted from weighted totals until
              shared-count semantics are verified. Asynchronous and unknown-time
              entries have no assigned time on the heatmap. Course subjects do
              not identify students’ majors.
            </p>
          </div>
          <div className="source-list">
            <h3>Sources & coverage</h3>
            {data?.sources.map((s) => (
              <a key={s.name} href={s.url} target="_blank" rel="noreferrer">
                {s.name}
                <small>
                  Downloaded{" "}
                  {new Date(s.observedAt).toLocaleString("en-US", {
                    timeZone: "America/Los_Angeles",
                  })}{" "}
                  Pacific ·{" "}
                  {s.sourceDataDate
                    ? `Source date ${s.sourceDataDate}`
                    : "Source data date not supplied"}
                </small>
              </a>
            ))}
            <p>
              {format(data?.quality.combinedSectionsExcludedFromWeights || 0)}{" "}
              combined sections excluded from weights.
            </p>
            <p>
              {format(
                filtered.filter(
                  (s) => !s.meetings.some((m) => m.kind === "scheduled"),
                ).length,
              )}{" "}
              filtered sections have no fixed meeting time.
            </p>
            <a
              href={`${REPO}/blob/main/docs/DATA.md`}
              target="_blank"
              rel="noreferrer"
            >
              Read the data documentation
            </a>
          </div>
        </section>
        <footer>
          <span>
            <strong>SJSU TimeMap</strong> · Built for better event planning.
          </span>
          <span>
            Independent project. Not affiliated with San José State University.
          </span>
        </footer>
      </main>
      {selected && data && (
        <div className="drawer-backdrop" onClick={() => setSelected(null)}>
          <section
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key !== "Tab") return;
              const nodes = e.currentTarget.querySelectorAll<HTMLElement>(
                'button,input,a[href],select,[tabindex="0"]',
              );
              const first = nodes[0],
                last = nodes[nodes.length - 1];
              if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last?.focus();
              } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first?.focus();
              }
            }}
          >
            <div className="drawer-heading">
              <div>
                <p className="eyebrow">BEHIND THE HEATMAP</p>
                <h2 id="detail-title">{DAYS[selected.day]}</h2>
                <p>
                  {clock(selected.start)}–{clock(selected.end)} · {timeLabel}
                </p>
              </div>
              <button
                className="close-button"
                onClick={() => setSelected(null)}
                autoFocus
                aria-label="Close class details"
              >
                ×
              </button>
            </div>
            <p className="helper">
              Sections with a meeting overlapping this window during the
              selected period. Their students may overlap across different
              classes.
            </p>
            <input
              type="search"
              aria-label="Search contributing classes"
              placeholder="Search these classes"
              value={detailSearch}
              onChange={(e) => setDetailSearch(e.target.value)}
            />
            <p className="detail-count">
              {format(detail.length)} overlapping sections
            </p>
            <div className="class-list">
              {detail.slice(0, 150).map((s) => (
                <article className="class-card" key={s.id}>
                  <div>
                    <strong>{s.course}</strong>
                    <span>
                      Section {s.section} · {s.component}
                    </span>
                  </div>
                  <h3>{s.title}</h3>
                  <p>{s.instructor}</p>
                  <p>
                    {s.meetings
                      .filter(
                        (m) =>
                          m.days.includes(selected.day) &&
                          m.kind === "scheduled",
                      )
                      .map(
                        (m) =>
                          `${clock(m.startMinute!)}–${clock(m.endMinute!)} · ${m.location}`,
                      )
                      .join(" / ")}
                  </p>
                  <div className="class-meta">
                    <span>{s.modality}</span>
                    <span>
                      {s.enrollment === null
                        ? "Enrollment unknown"
                        : `${s.enrollment} enrolled`}
                    </span>
                    {s.combinedFlag && <span>Combined · unweighted</span>}
                  </div>
                </article>
              ))}
              {detail.length > 150 && (
                <p className="helper">
                  Showing the first 150 matches. Search to narrow the list.
                </p>
              )}
              {!detail.length && <p>No matching scheduled classes.</p>}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
