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

## 2026-11-26 UTC - hosted verification

- GitHub's complete source-import workflow passed on a hosted Linux runner, committed new public observations, and produced the static artifact. No laptop process was involved in that run.
- CI passed independently. Both hosted runs include the regression suite and production build.
- Browser QA confirmed both terms, mobile layout without horizontal overflow, class details, filtering, weighted coverage, specific-week views, and CSV/PNG downloads. No browser errors or warnings were observed.
- Corrected two decorative characters with explicit Unicode escapes and kept timed meetings excluded by a location filter out of the unknown-time count.
- Added regression checks for portable publication bytes and rejection of a mismatched enrollment export.
- Configured the exact app-only Gandi destination from FileZilla. Server uploads remain disabled pending connection secrets and trusted host key.

## 2026-11-26 - event-opportunity planner

- Replaced quietest-window suggestions with enrollment-based relative opportunities combining complete buffered-event conflicts and nearby physical activity.
- Kept online conflicts, physical-only activity, within-section deduplication, own-component exclusions, actual-date averaging, and unknown/combined enrollment exclusions explicit.
- Added a readable planner with raw signal bars, coverage, nine assumption settings, ranking stability, all-location conflict inspection, and full-candidate CSV export.
- Preserved planning settings in shared URLs and kept recommendations independent of heatmap metric/location controls.
- Added focused regression fixtures and integration checks against both published semesters. The production build and browser checks cover responsive layout, filtering, specific weeks, URL restoration, exports, and empty states.
- Validation passed: 24 TypeScript calculation/integration tests, 12 Python regression tests, both published dataset hashes, and the production build. The downloaded ranking CSV was checked independently for its 195 rows, selected settings, score formula, view URL, and provenance.
- Documented the proposed model and research basis in OPPORTUNITIES.md. Scores are not calibrated attendance or presence estimates.
- Recorded the owner's explicit decision to defer production deployment until v1 approval. Gandi remains disabled.

## Workspace rename

The desktop preview helper retained the old workspace path. A temporary compatibility junction supported visual QA and is removed at teardown. Reopen the renamed project directory in Codex if the app still displays its former path.
