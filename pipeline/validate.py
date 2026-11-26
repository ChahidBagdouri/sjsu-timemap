"""Validate published snapshots without network access (used in CI)."""

import hashlib
import json
from pathlib import Path
from .schedule import SourceError

ROOT = Path(__file__).resolve().parents[1]


def validate(directory: Path) -> None:
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("schemaVersion") != 1 or not manifest.get("terms"):
        raise SourceError("Invalid or empty manifest")
    for item in manifest["terms"]:
        filename = item["file"]
        if Path(filename).name != filename:
            raise SourceError("Manifest file must be a basename")
        raw = (directory / filename).read_bytes()
        if hashlib.sha256(raw).hexdigest() != item["sha256"]:
            raise SourceError(f"Snapshot hash mismatch: {filename}")
        dataset = json.loads(raw)
        if dataset.get("schemaVersion") != 1 or dataset["term"]["id"] != item["id"]:
            raise SourceError("Term identity/schema mismatch")
        ids = [s["id"] for s in dataset["sections"]]
        if len(ids) != len(set(ids)) or len(ids) != item["sections"]:
            raise SourceError("Duplicate or missing section identities")
        if dataset["quality"]["parseIssues"]:
            raise SourceError("A published snapshot contains parse failures")
        for section in dataset["sections"]:
            for meeting in section["meetings"]:
                if meeting["kind"] == "scheduled" and not (
                    0 <= meeting["startMinute"] < meeting["endMinute"] <= 1440
                    and meeting["days"]
                ):
                    raise SourceError("Invalid scheduled interval")
            if section["weightingEligible"] and (
                section["enrollment"] is None
                or section["combinedFlag"]
                or section["status"] != "active"
            ):
                raise SourceError(
                    "Ineligible section was assigned an enrollment weight"
                )
        print(
            f"Validated {item['id']}: {len(ids)} sections, {dataset['quality']['joinCoverage']:.2%} enrollment join"
        )


if __name__ == "__main__":
    validate(ROOT / "public/data")
