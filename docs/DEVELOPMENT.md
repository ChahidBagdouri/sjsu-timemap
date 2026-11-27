# Development

Use Python 3.13 and Node 22 (22.12+). Commands run from the repository checkout, locally `sjsu-timemap/dev`.

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
npm ci
npm run dev
```

Open the Local URL printed by Vite, including `/sjsu-timemap/`. Linux/macOS users substitute `.venv/bin/python` for the Windows Python path. If a Windows npm wrapper drops additional flags, invoke Vite directly: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort`.

## Data collection

```powershell
# Latest two published spring/fall semesters; retain previously imported terms.
.\.venv\Scripts\python -m pipeline.refresh --with-enrollment --discover
# Explicit semesters.
.\.venv\Scripts\python -m pipeline.refresh --with-enrollment --terms fall-2026 spring-2027
# Rebuild from downloaded sources without network access.
.\.venv\Scripts\python -m pipeline.refresh --offline --with-enrollment
# Validate published hashes and invariants.
.\.venv\Scripts\python -m pipeline.validate
```

No university credentials are needed. Raw responses and temporary anonymous session information are ignored under `data/raw/`. Published normalized data, provenance, source hashes, and quality reports are tracked in Git. The original De Anza reference remains outside this new implementation.

## Verification

```powershell
.\.venv\Scripts\python -m unittest discover -s tests -v
npm test
npm run build
```

Python fixtures cover real multiple-meeting markup, blank location placeholders, legacy labels, UTF-16 TSV exports, statuses, conflicting counts, and deployment destination validation. TypeScript tests cover exact boundaries, short sessions, duplicate meetings, enrollment unknowns, and area preservation across display intervals.

The build produces static `dist/` output for `/sjsu-timemap/`. It needs HTTP hosting for dataset fetches; opening `index.html` using `file://` is not supported. Prettier formats browser code/docs/workflows; Black formats Python. On Windows, use explicit UTF-8 when reading and writing source files.

Source-code licensing remains an owner decision. No license has been silently selected.

## Event opportunity calculations

`src/opportunities.ts` evaluates the nine schedule-derived assumption settings; `src/EventPlanner.tsx` presents them. Regression tests cover full-event feasibility and date-specific activity, and integration tests read each current manifest snapshot. See [Event opportunities](OPPORTUNITIES.md) before changing scoring, normalization, candidate scope, or the meaning of coverage. The planner uses reported enrollment independently of the heatmap metric or location.
