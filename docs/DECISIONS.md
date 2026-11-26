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
- Production SFTP endpoint, host key, application directory, and deployment credential remain to be configured.
- Full public Tableau export completeness and combined-section count semantics require empirical validation.
