# Dataset contract (schemaVersion 1)

`public/data/manifest.json` lists content-addressed semester files, SHA-256 hashes, date envelopes, section counts, and enrollment matching coverage. The browser checks this manifest periodically and offers an explicit refresh.

## Semester

- `schemaVersion`, `parserVersion`, `generatedAt`: format, collector version, and observation/publication metadata.
- `term`: stable ID, label, America/Los_Angeles, and earliest/latest source meeting dates. This envelope can extend beyond regular-session instruction dates.
- `sources`: official URL, observation/download time, raw SHA-256, and `sourceDataDate` when supplied. Null means unknown; a download time is not a source data date.
- `quality`: source rows, distinct sections, duplicates, parse issues, enrollment joins, combined exclusions, cancellations, and unmatched section identities.
- `warnings`: limitations for downstream users.
- `sections`: normalized source records.

## Sections and meetings

The section ID combines term and class number. Course, subject, section, and component describe the offering. Each section owns multiple meetings with weekday indexes (Monday 0 to Sunday 6), minute boundaries, inclusive date bounds, location, and kind (`scheduled`, `asynchronous`, `unknown`).

Intervals are `[startMinute, endMinute)`. The end is exclusive. Distinct meetings are preserved. Duplicate and overlapping intervals within one section are unioned for each actual date before aggregation.

Status is active, canceled, or tentative. Source `S` (stop further enrollment) is preserved as `sourceClassStatus: S` and maps to active for a section still in the public schedule: enrollment closure does not establish cancellation.

Enrollment, capacity, and waitlist are nonnegative integers or null. A real zero is preserved. Weighting requires active status, known enrollment, and no unresolved combined-section relationship. Combined IDs are provenance, not permission to blindly sum or deduplicate shared counts.

## Calculations

- **Class sections:** simultaneous distinct active section identities. Cross-listed identities can describe the same physical instruction; this is not room occupancy.
- **Enrolled students:** sum of eligible reported section counts. This estimates scheduled commitments, not exact unique people or measured attendance.
- **Seat capacity:** known capacity for eligible sections, explicitly labeled as capacity.
- **Semester average:** arithmetic mean for each weekday across that weekday's dates in the source date envelope. Meeting date ranges determine occurrences. Holidays and exceptions are not yet removed.
- **Specific week:** published recurring patterns for the selected Monday-through-Sunday date range.
- **Display cell:** average exact-minute load during its 5/15/30-minute interval. Peak interval load is the maximum displayed cell average.
- **Event window:** average and peak exact-minute load over the window, optionally extended by 15-minute transition buffers; weekdays 9 AM-8 PM. Suggested windows do not overlap on the same day.

## Publication gates

Missing/changed tables, unparsed schedule rows, conflicting duplicates, an unconfirmed Tableau semester, a college-filtered export, enrollment joins below 98%, or a section-count decrease above 20% fail publication. Requested terms validate before the manifest changes. Immutable dataset filenames prevent readers receiving mixed versions.

Current and one prior generated snapshot per term are retained in the checkout. Remote deployment retains at least two and prunes strictly named TimeMap datasets older than 14 days only within the verified app directory. This is bounded rollback retention, not a complete daily historical archive.
