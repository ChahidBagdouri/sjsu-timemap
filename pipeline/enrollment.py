"""Normalize the public Tableau section crosstab; never infer enrollment from vacancies."""

from __future__ import annotations
import csv
import io
import re
from .schedule import SourceError

REQUIRED = {"Class Nbr", "Class Stat", "All Stdnts", "Max Enr"}


def count(value: str) -> int | None:
    value = value.strip().replace(",", "")
    if value in {"", "-", "Null", "null", "*"}:
        return None
    if not re.fullmatch(r"\d+(?:\.0+)?", value):
        raise SourceError(f"Invalid enrollment count: {value!r}")
    return int(value.split(".")[0])


def parse_enrollment(blob: bytes) -> tuple[dict[str, dict], dict]:
    text = blob.decode(
        "utf-16" if blob.startswith((b"\xff\xfe", b"\xfe\xff")) else "utf-8-sig"
    )
    delimiter = "\t" if "\t" in text.splitlines()[0] else ","
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    fields = {x.strip() for x in reader.fieldnames or []}
    if not REQUIRED.issubset(fields):
        raise SourceError(
            f"Enrollment headers changed or wrong worksheet: missing {sorted(REQUIRED-fields)}"
        )
    records, totals, duplicate_rows, raw_rows = {}, 0, 0, 0
    for original in reader:
        raw_rows += 1
        row = {
            k.strip(): (v or "").strip() for k, v in original.items() if k is not None
        }
        if row["Class Stat"] not in {"A", "X", "T", "S"}:
            if row["Class Stat"] == "Total" or row["Class Nbr"] == "Total":
                totals += 1
                continue
            raise SourceError(f"Unexpected class status: {row['Class Stat']!r}")
        number = row["Class Nbr"]
        if not number.isdigit():
            raise SourceError(f"Invalid enrollment class number: {number!r}")
        combined_id = row.get("sctn_combined_id", "")
        combined_flag = bool(combined_id) or row.get("Cmb Sec", "") not in {
            "",
            "N",
            "No",
        }
        record = {
            "status": {"A": "active", "S": "active", "X": "canceled", "T": "tentative"}[
                row["Class Stat"]
            ],
            "sourceClassStatus": row["Class Stat"],
            "enrollment": count(row["All Stdnts"]),
            "capacity": count(row["Max Enr"]),
            "waitlist": count(row.get("Wait List", "")),
            "combinedGroup": combined_id or None,
            "combinedFlag": combined_flag,
            "college": row.get("College") or None,
            "department": row.get("Department") or None,
            "courseLevel": row.get("course_level") or None,
        }
        if number in records:
            if records[number] != record:
                raise SourceError(f"Conflicting enrollment records for class {number}")
            duplicate_rows += 1
        records[number] = record
    if not records:
        raise SourceError("No section enrollment records were exported")
    return records, {
        "exportRows": raw_rows,
        "subtotalRowsRemoved": totals,
        "duplicateEnrollmentRows": duplicate_rows,
        "exportSections": len(records),
        "exportColleges": sorted(
            {r["college"] for r in records.values() if r["college"]}
        ),
    }


def join_enrollment(
    sections: list[dict], records: dict[str, dict], observed_at: str
) -> dict:
    matches, canceled, eligible, combined = 0, 0, 0, 0
    for section in sections:
        record = records.get(section["classNumber"])
        if record is None:
            continue
        matches += 1
        section.update(record)
        section["enrollmentObservedAt"] = observed_at
        # Until shared-count semantics are verified, combined sections remain visibly unweighted.
        section["weightingEligible"] = (
            record["status"] == "active"
            and record["enrollment"] is not None
            and not record["combinedFlag"]
        )
        canceled += record["status"] == "canceled"
        eligible += section["weightingEligible"]
        combined += record["combinedFlag"]
    return {
        "unmatchedSections": [
            {"classNumber": s["classNumber"], "course": s.get("course", "")}
            for s in sections
            if s["classNumber"] not in records
        ],
        "enrollmentMatches": matches,
        "joinCoverage": matches / len(sections) if sections else 0,
        "weightableSections": eligible,
        "combinedSectionsExcludedFromWeights": combined,
        "canceledSections": canceled,
    }
