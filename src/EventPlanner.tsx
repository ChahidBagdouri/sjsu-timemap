import { useMemo } from "react";
import { addDays, clock, DAYS, monday } from "./engine";
import {
  PROXIMITY_WINDOWS,
  TRAVEL_BUFFERS,
  rankEventOpportunities,
  type OpportunityOptions,
  type OpportunityPeriod,
  type OpportunityWindow,
} from "./opportunities";
import { downloadOpportunitiesCsv } from "./export";
import type { Dataset, Section } from "./types";

const format = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 1 });
type Props = {
  data: Dataset | null;
  sections: Section[];
  loading: boolean;
  period: OpportunityPeriod;
  periodLabel: string;
  options: OpportunityOptions;
  onOptions: (options: OpportunityOptions) => void;
  onInspect: (window: OpportunityWindow, buffer: number) => void;
};

export default function EventPlanner({
  data,
  sections,
  loading,
  period,
  periodLabel,
  options,
  onOptions,
  onInspect,
}: Props) {
  const ranking = useMemo(
    () =>
      data && !loading
        ? rankEventOpportunities(sections, data.term, period, options)
        : null,
    [data, sections, loading, period.mode, period.week, options],
  );
  const coverage = ranking?.coverage;
  const coveragePercent = coverage?.timedSections
    ? Math.round((100 * coverage.eligibleSections) / coverage.timedSections)
    : 0;
  let empty = "";
  if (loading) empty = "Comparing event windows…";
  else if (!ranking)
    empty = "Semester data is unavailable. Retry loading the schedule above.";
  else if (!coverage?.timedSections)
    empty =
      "No weekday meeting patterns in this period. Try another week or change the audience filters.";
  else if (!coverage.eligibleSections)
    empty =
      "No usable enrollment counts for these sections. Change the audience filters or semester. Unknown counts are never treated as zero.";
  else if (!ranking.maxActivity)
    empty =
      "No nearby physical class activity under these settings. Online and unknown-location meetings cannot establish a campus activity signal.";
  else if (!ranking.suggestions.length)
    empty =
      "No balanced windows found under these settings. Try a shorter event or change the travel buffer and nearby class window.";

  return (
    <section
      className="panel opportunity-panel"
      id="event-planner"
      aria-labelledby="opportunity-title"
      aria-busy={loading}
    >
      <div className="opportunity-heading">
        <div>
          <p className="eyebrow">MAKE TIME TO MEET</p>
          <h2 id="opportunity-title">Find event opportunities</h2>
          <p>
            Balance class conflicts with physical class activity before and
            after your event.
          </p>
        </div>
        <button
          className="button secondary"
          disabled={!ranking?.candidateCount || !coverage?.eligibleSections}
          onClick={() =>
            data &&
            ranking &&
            downloadOpportunitiesCsv(ranking, data, periodLabel, options)
          }
        >
          Export rankings CSV
        </button>
      </div>
      <div className="opportunity-controls">
        <label className="field">
          Event length
          <select
            value={options.duration}
            onChange={(e) =>
              onOptions({ ...options, duration: Number(e.target.value) })
            }
          >
            {[30, 60, 90, 120].map((n) => (
              <option key={n} value={n}>
                {n} minutes
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Travel buffer
          <select
            value={options.buffer}
            onChange={(e) =>
              onOptions({
                ...options,
                buffer: Number(e.target.value) as OpportunityOptions["buffer"],
              })
            }
          >
            {TRAVEL_BUFFERS.map((n) => (
              <option key={n} value={n}>
                {n} minutes each side
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Nearby class window
          <select
            value={options.proximity}
            onChange={(e) =>
              onOptions({
                ...options,
                proximity: Number(
                  e.target.value,
                ) as OpportunityOptions["proximity"],
              })
            }
          >
            {PROXIMITY_WINDOWS.map((n) => (
              <option key={n} value={n}>
                {n} minutes beyond buffer
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="opportunity-scope">
        {data?.term.label} · {periodLabel} · Mon–Fri, 9 AM–8 PM Pacific. Uses
        your subjects, college and instruction mode. Heatmap metric and location
        do not change these rankings; online meetings still count as conflicts.
      </p>
      <div className="opportunity-disclaimer">
        <strong>Relative opportunity, not predicted attendance.</strong>
        <span>
          Nearby activity suggests a reason to be on campus. It does not tell us
          who stays, is free, or belongs to your club. Holidays and exceptions
          are not applied.
        </span>
      </div>
      {coverage && coverage.timedSections > 0 && (
        <p className="opportunity-coverage">
          <strong>{coveragePercent}% enrollment coverage</strong> ·{" "}
          {format(coverage.eligibleSections)} of{" "}
          {format(coverage.timedSections)} weekday sections usable.{" "}
          {format(coverage.combinedSections)} combined and{" "}
          {format(coverage.missingEnrollment)} unknown-enrollment sections
          omitted; these categories can overlap.{" "}
          {format(coverage.unknownTimeSections)} sections have no fixed time.
        </p>
      )}
      <div aria-live="polite">
        {empty ? (
          <p className="opportunity-empty">{empty}</p>
        ) : (
          <ol className="opportunity-list">
            {ranking?.suggestions.map((window) => (
              <li key={window.day + "-" + window.start}>
                <article
                  className="opportunity-card"
                  aria-label={
                    DAYS[window.day] +
                    " " +
                    clock(window.start) +
                    " event opportunity"
                  }
                >
                  <div className="opportunity-card-heading">
                    <div>
                      <p className="opportunity-day">
                        {DAYS[window.day]}
                        {period.mode === "week"
                          ? " · " +
                            new Date(
                              addDays(monday(period.week), window.day) +
                                "T12:00:00Z",
                            ).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              timeZone: "UTC",
                            })
                          : ""}
                      </p>
                      <h3>
                        {clock(window.start)}–{clock(window.end)}
                      </h3>
                    </div>
                    <div
                      className="opportunity-score"
                      aria-label={
                        "Opportunity score " +
                        format(window.score) +
                        " out of 100"
                      }
                    >
                      <strong>{format(window.score)}</strong>
                      <span>/ 100</span>
                    </div>
                  </div>
                  <dl className="opportunity-signals">
                    <div>
                      <dt>
                        Nearby activity <small>higher is better</small>
                      </dt>
                      <dd>
                        {format(window.nearby)} <small>weighted units</small>
                      </dd>
                      <span
                        className="opportunity-bar activity"
                        aria-hidden="true"
                      >
                        <i
                          style={{
                            width: 100 * window.normalizedActivity + "%",
                          }}
                        />
                      </span>
                    </div>
                    <div>
                      <dt>
                        Conflicting enrollments <small>lower is better</small>
                      </dt>
                      <dd>{format(window.conflicts)}</dd>
                      <span
                        className="opportunity-bar conflict"
                        aria-hidden="true"
                      >
                        <i
                          style={{
                            width: 100 * window.normalizedConflicts + "%",
                          }}
                        />
                      </span>
                    </div>
                  </dl>
                  <p className="opportunity-stability">
                    Top 10% in <strong>{window.topSettings}/9</strong> settings
                  </p>
                  <details className="opportunity-assumptions">
                    <summary>Assumptions and ranking</summary>
                    <p>
                      Rank {window.rank} of {ranking.candidateCount} time slots
                      in this view. Across nine settings: rank {window.minRank}–
                      {window.maxRank}. Ties share a rank. These are sensitivity
                      checks, not statistical confidence.
                    </p>
                    <p>
                      Nearby contribution: {format(window.ending)} from class
                      endings; {format(window.starting)} from upcoming starts.
                      Only the stronger boundary per section is counted.
                    </p>
                    <table>
                      <caption>
                        Score and rank by travel buffer and nearby class window
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Buffer</th>
                          {PROXIMITY_WINDOWS.map((n) => (
                            <th scope="col" key={n}>
                              {n} min
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {TRAVEL_BUFFERS.map((buffer) => (
                          <tr key={buffer}>
                            <th scope="row">{buffer} min</th>
                            {PROXIMITY_WINDOWS.map((proximity) => {
                              const setting = window.settings.find(
                                (s) =>
                                  s.buffer === buffer &&
                                  s.proximity === proximity,
                              )!;
                              return (
                                <td
                                  key={proximity}
                                  className={
                                    buffer === options.buffer &&
                                    proximity === options.proximity
                                      ? "chosen-setting"
                                      : ""
                                  }
                                >
                                  <strong>{format(setting.score)}</strong>
                                  <small>rank {setting.rank}</small>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                  <button
                    className="opportunity-inspect"
                    onClick={() => onInspect(window, options.buffer)}
                  >
                    Inspect conflicts
                  </button>
                </article>
              </li>
            ))}
          </ol>
        )}
      </div>
      <details className="opportunity-method">
        <summary>How the opportunity score works</summary>
        <p>
          Score = 100 × relative nearby activity × (1 − relative conflicting
          enrollments). Each signal is divided by its maximum across all{" "}
          {ranking?.candidateCount || 0} candidate weekday slots in this
          semester, period, audience and event length. Zero activity always
          scores zero. Scores are not comparable between different filtered
          views.
        </p>
        <p>
          Any meeting overlapping the full event or either travel buffer counts
          as a conflict, once per section per date. For nearby activity, known
          physical meetings can end before the first buffer or start after the
          last. Contributions decline linearly to zero at the selected nearby
          class window. A section with its own overlapping component is excluded
          from nearby activity.
        </p>
        <p>
          Semester views average each weekday's date-specific results, including
          dates with no meetings. Specific-week views use that week's published
          dates. Holidays and exceptional cancellations are not modeled.
          Weighted counts omit unresolved combined sections and unknown
          enrollment; capacity is never substituted.
        </p>
        <p>
          People can appear in multiple sections, and their complete schedules
          are unknown. This model does not observe campus presence, work
          commitments, interest or unique available students. The
          30/60/90-minute windows and 0/10/15-minute buffers are assumptions for
          comparison, not learned behavior.
        </p>
        <a
          href="https://github.com/ChahidBagdouri/sjsu-timemap/blob/main/docs/OPPORTUNITIES.md"
          target="_blank"
          rel="noreferrer"
        >
          Read the event-planning methodology
        </a>
      </details>
    </section>
  );
}
