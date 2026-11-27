# Event opportunities

TimeMap ranks candidate event windows using public schedules and eligible reported enrollment. It does not predict attendance, observe campus presence, or identify unique available students. No event history or personal timetable is required.

## Inputs and scope

The planner uses the selected semester, semester-average or specific-week period, subjects, college, and instruction mode. These filters describe course offerings, not student membership or complete student schedules. The heatmap's location filter and display metric do not affect the planner.

All eligible timed meetings, including synchronous online meetings, can cause conflicts. Only known physical meetings contribute nearby activity. The location classifier follows the heatmap's known-room rule: online/hybrid location labels, TBA, blank, and OFF CAMPUS are excluded. This does not infer walking distances or verify actual attendance. A travel buffer is a planning assumption.

Candidate starts occur every 15 minutes, Monday-Friday, between 9 AM and 8 PM Pacific. The complete event must fit in those hours. Event lengths are 30, 60, 90, or 120 minutes. Dates are clipped to the published semester envelope. Weekdays outside that range have no candidates.

Enrollment weighting requires an active section, known reported enrollment, and resolved weighting eligibility. Unresolved combined sections are omitted. Genuine zero enrollment remains zero. Missing enrollment is never replaced with zero, open seats, or capacity. Canceled and tentative offerings are excluded.

## Conflict signal

For an event `[t, t + L)` and a travel buffer `b` on each side, the conflict interval is `[t - b, t + L + b)`.

For each actual date, a section contributes its enrollment once if **any** of its timed meetings overlaps that interval. Duplicate, overlapping, and adjacent representations within a section are merged. Even a one-minute overlap counts the entire section enrollment; averaging minute loads would dilute a conflict that prevents full participation. Exact end boundaries are exclusive.

This quantity is conflicting **enrollments**, not unique people. Students may appear in multiple different sections over a long event interval.

## Nearby physical activity

A section can contribute nearby activity only if none of its own meetings conflicts with the buffered event on that date. This prevents a lecture ending before the event from contributing when the same section has a lab during it.

Find the closest physical meeting ending before the first buffer and the closest physical meeting starting after the last buffer. Define the nonnegative gaps beyond the buffers as:

```text
d_before = event_start - buffer - previous_meeting_end
d_after  = next_meeting_start - event_end - buffer
k(d, H)  = max(0, 1 - d / H)
activity = enrollment * max(k(d_before, H), k(d_after, H))
```

A missing boundary contributes zero. `H` is the selected 30-, 60-, or 90-minute nearby class window beyond the buffer. A boundary exactly at the buffer contributes full weight; one at or beyond `H` contributes zero. Contributions decline linearly between them.

The stronger of the two boundaries is used, so a section never counts twice for nearby activity. Ties are attributed to the class-ending component. The UI exposes class-ending and upcoming-start components in each recommendation's details; they sum to nearby activity.

The result is a proximity-weighted activity index. It is not the number of people waiting on campus or a probability of their remaining there. Different sections can still contain the same students.

## Date averaging

Compute conflicts and activity separately on each actual date before combining results. In semester mode, divide each weekday's totals by the number of that weekday in the published envelope, including dates with no relevant meetings. In week mode, use the occurrences within the selected week and semester bounds.

This preserves short sessions and changing meeting patterns. It does not apply holidays, exam schedules, exceptional cancellations, or exact irregular dates absent from the source. A selected holiday can therefore still show a published recurring pattern.

## Relative score

For every candidate in the current period, audience, and event length:

```text
a = nearby_activity / maximum_nearby_activity
c = conflicting_enrollments / maximum_conflicting_enrollments
score = 100 * a * (1 - c)
```

The maxima span all candidate weekdays together, not each day separately. If maximum activity is zero, `a = 0`; if maximum conflicts is zero, `c = 0`. Empty activity always scores zero. Unknown data remains omitted and visible in coverage rather than being interpreted as a zero-conflict student population.

The score is a proposed, uncalibrated heuristic combining the two displayed signals. Multiplication here is an index construction, not an independence assumption about student probabilities. A score of 60 means neither 60 students nor 60% availability. Scores are relative to the current candidate pool and are not comparable across semesters, filters, periods, event lengths, or assumption settings.

Candidates sort by descending score, then descending activity, ascending conflicts, weekday, and start time. Score ties within a numerical tolerance of 1e-9 share a competition rank. Up to five positive-score recommendations are selected without overlapping events on the same weekday. Buffers may overlap between separate alternatives; the list is a shortlist of choices, not a multi-event schedule.

## Sensitivity to assumptions

Every analysis evaluates nine combinations:

- Travel buffer on each side: 0, 10, or 15 minutes.
- Nearby class window beyond the buffer: 30, 60, or 90 minutes.

Each setting recalculates raw signals and normalization using the same candidate pool. The selected setting determines the main list; the other eight are shown in the details. A candidate's stability summary counts how many settings place its positive score within the top `ceil(candidate_count * 0.10)` competition ranks. Ties can include more than exactly 10% of slots. Best/worst rank and all nine score/rank pairs are available.

These settings are hypothetical planning assumptions, not measured stay times or statistically estimated confidence. No independent validation against event attendance exists yet.

## Interface and exports

The planner has its own coverage statement for active weekday sections in the period, separate from source matching coverage and the heatmap's metric coverage. Missing-enrollment and combined-section reason counts can overlap. Unknown-time sections are reported separately. The interface explains empty states for no weekday patterns, no eligible enrollment, no nearby physical signal, and no balanced positive-score windows.

Inspect conflicts opens all source sections overlapping the complete buffered interval, including online, unknown-enrollment, and combined offerings. Omitted weights remain visibly labeled. This list can include sections omitted from the weighted score, and semester lists are unions of applicable dates rather than average headcounts.

Planning settings survive shared URLs using `duration`, `travel`, and `nearby`; their defaults are 60 minutes, 10 minutes, and 60 minutes respectively. Existing heatmap filters and date selection are preserved. The ranking CSV exports **all** candidate slots with raw signals, normalized signals, relative score, rank, sensitivity summary, coverage, settings, view URL, snapshot version time, and source download times. Existing CSV/PNG heatmap exports still describe the heatmap, not this ranking.

## Research basis and limits

[Time geography and the space-time prism (Miller, 2017)](https://cpb-us-w2.wpmucdn.com/u.osu.edu/dist/a/390/files/2017/03/Miller-time-geography-and-space-time-prism-1rp3u1q.pdf) provides the feasibility framework: commitments, activity duration, and travel constrain access. [Time dependent accessibility (Kaza, 2015)](https://doi.org/10.1016/j.jum.2015.06.001) discusses opportunities and proximity weighting over time. The particular normalization, product score, linear temporal decay, and parameter choices above are TimeMap's proposed adaptation, not a validated formula from those publications.

Public section totals do not reveal which students take two different classes. They cannot establish a between-class audience or the intersection of free time and campus presence. Residents, campus workers, study visits, job and family commitments, event appeal, transport schedules, and willingness to make a special trip remain unobserved. Recommendations support shortlisting; organizers still need to check dates, venues, and their audience's circumstances.

## Verification

Regression fixtures cover exact boundaries, travel buffers, any-overlap conflicts, duplicate/adjacent meeting patterns, online/unknown/off-campus locations, lecture/lab self-conflicts, actual dates, short sessions, real zero versus missing enrollment, combined sections, no-activity states, normalization, nonoverlapping recommendations, all nine settings, and partial/out-of-term weeks. Integration checks exercise every published semester and require finite signals, valid coverage, and consistent decomposition. Browser QA covers filters, settings, all-location conflict inspection, CSV download, shared URL reload, semester/week changes, online-only empty states, and mobile layout.
