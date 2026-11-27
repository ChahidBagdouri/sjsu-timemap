# Architecture and decisions

## 2026-11-25: agreed direction

- Name: **SJSU TimeMap**, slug `sjsu-timemap`.
- New implementation; the De Anza app informs product goals only.
- Python collector and a React/TypeScript static browser app.
- No always-on application server or paid database.
- Public GitHub repository: https://github.com/ChahidBagdouri/sjsu-timemap
- GitHub-hosted scheduled jobs collect, validate, and build.
- Existing Gandi server serves `/sjsu-timemap/`; no Cloudflare dependency and no DNS migration.
- All new local work lives in `sjsu-timemap/dev`.

## Data integrity

Store source meeting definitions separately from enrollment observations. Join on term and class number. Preserve multiple meetings, session date ranges, combined-section membership, and unknowns. Validate before publishing a new snapshot; retain last valid published data on failure.

Browser computations use versioned semester JSON. Historical enrollment means observations actually collected at that time; today's export cannot recreate previous daily observations.

## Open decisions

- Source code license has not been selected.
- Production SFTP endpoint, trusted host key, and deployment credential remain to be configured. The application directory is confirmed in [Deployment](DEPLOYMENT.md). Deployment is deferred until explicit owner approval of v1.
- Full-term public Tableau export and enrollment joins have been verified. Combined-section shared-count semantics still require verification.

## 2026-11-26: event opportunities without attendance history

Replace minimum-load event suggestions with a relative opportunity index balancing full-event conflicting enrollments against proximity-weighted physical activity. Use actual date patterns, eligible enrollment, a stronger-boundary-per-section rule, and nine explicit buffer/proximity assumptions. Report raw signals and coverage; never label the result as attendance, campus occupancy, or unique available people. See [Event opportunities](OPPORTUNITIES.md) for the full contract.
