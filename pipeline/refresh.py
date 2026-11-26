"""Fetch official sources and atomically publish validated term JSON."""

from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import time
import urllib.request
from .schedule import parse_schedule, SourceError
from .enrollment import parse_enrollment, join_enrollment

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TERMS = ["fall-2026", "spring-2027"]


def fetch(url: str) -> bytes:
    for attempt in range(3):
        try:
            request = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "SJSU-TimeMap/0.1 (+https://github.com/ChahidBagdouri/sjsu-timemap)"
                },
            )
            with urllib.request.urlopen(request, timeout=90) as response:
                return response.read()
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2**attempt)
    raise AssertionError("unreachable")


def atomic_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_bytes(
        (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode(
            "utf-8"
        )
    )
    os.replace(temporary, path)


def build_term(
    term_id: str, raw: Path, enrollment_file: Path | None, observed_at: str
) -> dict:
    sections, quality = parse_schedule(raw.read_text(encoding="utf-8"), term_id)
    schedule_url = f"https://www.sjsu.edu/classes/schedules/{term_id}.php"
    sources = [
        {
            "name": "SJSU class schedule",
            "url": schedule_url,
            "observedAt": observed_at,
            "sourceDataDate": None,
            "sha256": hashlib.sha256(raw.read_bytes()).hexdigest(),
        }
    ]
    if enrollment_file:
        records, export_quality = parse_enrollment(enrollment_file.read_bytes())
        quality.update(export_quality)
        quality.update(join_enrollment(sections, records, observed_at))
        if quality["joinCoverage"] < 0.98:
            raise SourceError(
                f"Enrollment matched only {quality['joinCoverage']:.1%} of schedule sections; possible wrong term or partial export"
            )
        sources.append(
            {
                "name": "SJSU Enrollment Status Summary",
                "url": "https://prd-analytics.sjsu.edu/t/IRPublic/views/EnrollmentStatusSummaryDashboard/ESSD",
                "observedAt": observed_at,
                "sourceDataDate": None,
                "sha256": hashlib.sha256(enrollment_file.read_bytes()).hexdigest(),
            }
        )
    else:
        quality.update(
            {
                "enrollmentMatches": 0,
                "joinCoverage": 0,
                "weightableSections": 0,
                "combinedSectionsExcludedFromWeights": 0,
                "canceledSections": 0,
            }
        )
    dates = [m for s in sections for m in s["meetings"]]
    warnings = [
        "Campus holidays, exceptional cancellations, and final exams are not yet modeled.",
        "Subject filters describe course subjects, not students' majors.",
    ]
    if quality["joinCoverage"] < 0.95:
        warnings.append(
            "Enrollment coverage is incomplete; weighted values omit unmatched sections."
        )
    if quality["combinedSectionsExcludedFromWeights"]:
        warnings.append(
            "Combined sections are excluded from weighted totals pending verification of shared enrollment semantics."
        )
    return {
        "schemaVersion": 1,
        "parserVersion": "0.1.0",
        "generatedAt": observed_at,
        "term": {
            "id": term_id,
            "label": term_id.replace("-", " ").title(),
            "timeZone": "America/Los_Angeles",
            "startDate": min(m["startDate"] for m in dates),
            "endDate": max(m["endDate"] for m in dates),
        },
        "sources": sources,
        "quality": quality,
        "warnings": warnings,
        "sections": sections,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--terms", nargs="+", default=None)
    parser.add_argument(
        "--discover",
        action="store_true",
        help="Discover the latest two published fall/spring semesters",
    )
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Use previously downloaded raw source files",
    )
    parser.add_argument(
        "--with-enrollment",
        action="store_true",
        help="Download a complete public Tableau export",
    )
    parser.add_argument("--output", type=Path, default=ROOT / "public/data")
    args = parser.parse_args()
    raw_dir = ROOT / "data/raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    previous_path = args.output / "manifest.json"
    previous = (
        json.loads(previous_path.read_text(encoding="utf-8"))
        if previous_path.exists()
        else {"terms": []}
    )
    terms = args.terms or DEFAULT_TERMS
    if args.discover and not args.terms:
        import re

        index = fetch("https://www.sjsu.edu/classes/schedules/").decode("utf-8")
        found = set(re.findall(r"(?:fall|spring)-20\d{2}", index))
        terms = sorted(
            found, key=lambda t: (int(t[-4:]), t.startswith("fall")), reverse=True
        )[:2]
        if len(terms) < 2:
            raise SourceError("Could not discover two published semesters")
    builds = []
    for term_id in terms:
        if not __import__("re").fullmatch(
            r"(spring|summer|fall|winter)-20\d{2}", term_id
        ):
            raise SourceError(f"Invalid semester: {term_id}")
        raw = raw_dir / f"{term_id}.html"
        if not args.offline:
            raw.write_bytes(
                fetch(f"https://www.sjsu.edu/classes/schedules/{term_id}.php")
            )
        observed_at = datetime.fromtimestamp(
            raw.stat().st_mtime, timezone.utc
        ).isoformat()
        enrollment = raw_dir / f"{term_id}-enrollment.csv"
        if args.with_enrollment and not args.offline:
            from .tableau import download_enrollment

            download_enrollment(term_id, enrollment)
        # Enrollment is never silently carried from an older export into a fresh observation.
        if args.with_enrollment and not enrollment.exists():
            raise SourceError(f"Missing requested enrollment export: {enrollment}")
        use_enrollment = enrollment if args.with_enrollment else None
        value = build_term(term_id, raw, use_enrollment, observed_at)
        if use_enrollment:
            enrollment_observed = datetime.fromtimestamp(
                enrollment.stat().st_mtime, timezone.utc
            ).isoformat()
            value["sources"][1]["observedAt"] = enrollment_observed
            for section in value["sections"]:
                if section["enrollmentObservedAt"]:
                    section["enrollmentObservedAt"] = enrollment_observed
        builds.append(value)
        print(json.dumps({"term": term_id, "quality": value["quality"]}))
    # All sources validate before immutable datasets are written; manifest is last.
    args.output.mkdir(parents=True, exist_ok=True)
    entries = {item["id"]: item for item in previous["terms"]}
    for value in builds:
        term_id = value["term"]["id"]
        old = entries.get(term_id)
        if old and len(value["sections"]) < old["sections"] * 0.8:
            raise SourceError(
                f"Section count unexpectedly fell by more than 20% for {term_id}"
            )
        body = (
            json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n"
        ).encode("utf-8")
        digest = hashlib.sha256(body).hexdigest()
        filename = f"{term_id}-{digest[:12]}.json"
        atomic_json(args.output / filename, value)
        entries[term_id] = {
            **value["term"],
            "file": filename,
            "sections": len(value["sections"]),
            "enrollmentCoverage": value["quality"]["joinCoverage"],
            "sha256": digest,
        }
    manifest = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "terms": sorted(
            entries.values(),
            key=lambda t: (int(t["id"][-4:]), t["id"].startswith("fall")),
            reverse=True,
        ),
    }
    atomic_json(args.output / "manifest.json", manifest)
    # Keep current and one prior generated dataset per term in the checkout.
    # The deployer retains remote versions for at least 14 days for open viewers.
    import re

    for term_id in entries:
        versions = sorted(
            args.output.glob(f"{term_id}-*.json"),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        for old in versions[2:]:
            if re.fullmatch(
                r"(?:fall|spring|winter|summer)-20\d{2}-[a-f0-9]{12}\.json", old.name
            ):
                old.unlink()
        legacy = args.output / f"{term_id}.json"
        if legacy.exists():
            legacy.unlink()


if __name__ == "__main__":
    main()
