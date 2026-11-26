# Working on SJSU TimeMap

Keep source, tests, workflows, and documentation in this checkout. Preserve the user's sibling reference directory.

- Document behavior, source discoveries, limitations, and operational changes as they are implemented.
- Treat enrollment as an observed section count, never inferred from open seats.
- Preserve distinct meeting patterns; deduplicate representations without dropping labs.
- Never replace missing enrollment with zero or capacity without an explicit estimated mode.
- Public datasets must include source timestamps, coverage, and reproducibility metadata.
- Use exact minute intervals with exclusive end boundaries; keep America/Los_Angeles local schedule time.
- Keep production uploads confined to an explicitly configured application directory. Never synchronize a hosting root or delete sibling projects.
- Keep credentials out of Git and public output.
- Run parser/aggregation tests and the production build after relevant changes.
- Report unresolved data issues honestly in docs and UI.
