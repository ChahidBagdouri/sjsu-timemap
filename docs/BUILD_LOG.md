# Build log

## 2026-11-25 - first working version

- Created https://github.com/ChahidBagdouri/sjsu-timemap and pushed architecture documentation before implementation.
- Renamed the local parent directory to `sjsu-timemap`; all new work is under `dev`. The supplied De Anza reference remains alongside it.
- Parsed all 6,980 Fall rows into 6,979 distinct sections and all 6,688 Spring rows into 6,687. Each source had one repeated row.
- Preserved multiple meeting patterns, blank location placeholders, labs, and legacy labels. Unparsed rows fail publication.
- Implemented Tableau's current anonymous startSession handshake and public section crosstab export across ten college/group categories.
- Fixed a filter-context issue that accepted a semester update while retaining a captured story's default term. Commands now include storyboard and story-point context and verify the selected term.
- Verified enrollment joins: Fall 6,978/6,979 (99.99%); Spring 6,672/6,687 (99.78%). Combined and unknown counts stay unweighted.
- Added exact-minute/date-aware heatmaps, multi-subject and location/modality/college filters, class details, event-window ranking, common starts/ends, shared views, and CSV/PNG export.
- Added parser/aggregation/publication/deployment tests, immutable snapshots, CI, and scheduled cloud imports. Gandi uploads are gated behind an explicit enable variable.
- Browser checks exercised subject filtering, enrollment mode, class details, specific-week selection, 5-minute bins, and PNG generation.
- The owner supplied the FileZilla website directory. Only the app subdirectory is a permitted deployment destination; credentials remain separate.

## Workspace rename

The desktop preview helper retained the old workspace path. A temporary compatibility junction supported visual QA and is removed at teardown. Reopen the renamed project directory in Codex if the app still displays its former path.
