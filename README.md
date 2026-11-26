# SJSU TimeMap

Class schedule heatmaps for better event planning at San José State University.

TimeMap combines public meeting schedules with section enrollment counts to help clubs understand when classes are concentrated, common meeting patterns, and less-conflicted event windows. Enrollment-weighted values describe scheduled student commitments, not measured attendance or exact unique people.

## Project status

Initial development. The first milestone is a reproducible, validated full-semester import. See [Roadmap](docs/ROADMAP.md) and [Build log](docs/BUILD_LOG.md) for verified progress and limitations.

## Structure

- `pipeline/`: Python ingestion, normalization, validation, and publishing.
- `src/`: static browser application.
- `public/data/`: published semester snapshots and manifest.
- `tests/`: meaningful parser and aggregation fixtures.
- `scripts/`: development and narrowly scoped deployment tools.
- `.github/workflows/`: cloud validation and data refresh jobs.
- `docs/`: architecture, data contracts, decisions, and operations.

The local Git checkout lives in `sjsu-timemap/dev`. The original De Anza reference remains in the sibling `../reference` directory and is not distributed as this project's source.

## Deployment target

`https://chahid.bagdouri.com/sjsu-timemap/` on existing Gandi hosting. GitHub Actions handles collection and builds; Gandi serves static output. Deployment credentials and the actual remote directory are configured separately.

## Documentation

- [Architecture and decisions](docs/DECISIONS.md)
- [Sources and data semantics](docs/DATA.md)
- [Deployment and operations](docs/DEPLOYMENT.md)
- [Roadmap](docs/ROADMAP.md)
- [Build log](docs/BUILD_LOG.md)

Independent student project; not an official SJSU service. No student rosters or individual student information are required.
