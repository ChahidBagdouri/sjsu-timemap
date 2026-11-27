# Sources and data semantics

## Official sources

1. Schedule index: https://www.sjsu.edu/classes/schedules/
2. Semester tables, e.g. https://www.sjsu.edu/classes/schedules/spring-2027.php
3. Enrollment Status Summary Dashboard: https://prd-analytics.sjsu.edu/t/IRPublic/views/EnrollmentStatusSummaryDashboard/ESSD
4. Refresh timing: https://www.sjsu.edu/irsa/dashboards/daily.php
5. Scheduling definitions: https://www.sjsu.edu/provost/abso/academic-sched-space-mgmt/classes.php

Schedule tables refresh nightly. IRSA says enrollment data is updated at 9:30 PM and becomes viewable the next morning. Download time and the source's data date must be recorded separately.

## Findings already verified in research

- The semester table has `id=classSchedule`; its load button reveals existing markup.
- Meeting cells contain HTML line breaks and repeated day labels inside time cells. Flattening whitespace loses structure.
- The public ESSD dashboard offers a section crosstab export containing Class Nbr, All Stdnts, Max Enr, Wait List, Class Stat, and combined-section metadata.
- A Spring 2027 Business sample was downloaded successfully. Its CSV-named file is UTF-16, tab-delimited, and includes subtotal and canceled rows.
- The dashboard documents that only its first meeting pattern is shown. Schedules remain the meeting source.

## Metrics

Class concentration counts distinct active sections/meeting entities. Weighted concentration sums known enrollment for active sections, with explicit combined-section handling. Exact unique people over an event window cannot be derived from section totals.

Synchronous online meetings consume scheduled time. Asynchronous and unknown-time entries are reported separately. A course-subject filter does not identify student majors or club membership.

## Initial validation gates

Verify full-semester source coverage, duplicate identifiers, time/day parsing, enrollment joins, canceled rows, source data date, and combined-section semantics before presenting weights as complete. Never silently discard unparsed records.

## Adapter verification

The adapter uses anonymous startSession and the same public crosstab offered by the dashboard. Session field IDs are discovered rather than hardcoded. Select-all uses `filter-all`; an empty replacement selects nothing. Semester changes must include ESSD storyboard/story-point context. Unchanged filter responses retain the initial confirmed state.

Initial checks on 2026-11-25 matched Fall 6,978/6,979 schedule sections (99.99%) and Spring 6,672/6,687 (99.78%). These are historical baseline matching percentages, not weighting coverage; current counts are in the published manifest and dataset quality report. See [Schema](SCHEMA.md) and [Known limitations](KNOWN_LIMITATIONS.md).

SJSU documents tentative sections and distinguishes enrollment closure from cancellation: https://blogs.sjsu.edu/makeithappen/2025/11/13/university-meeting-communication-takeaways/
