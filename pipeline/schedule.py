"""Parse the public semester table without flattening multiple meeting patterns."""

from __future__ import annotations
import re
from datetime import datetime
from bs4 import BeautifulSoup

DAY_INDEX = {d: i for i, d in enumerate("MTWRFSU")}
TIME_RANGE = re.compile(
    r"(\d{1,2}:\d{2}\s*[AP]M)\s*[-Ã¢â‚¬â€œ]\s*(\d{1,2}:\d{2}\s*[AP]M)", re.I
)
DATE_RANGE = re.compile(r"(\d{2}/\d{2}/\d{2,4})\s*[-Ã¢â‚¬â€œ]\s*(\d{2}/\d{2}/\d{2,4})")


class SourceError(ValueError):
    """A source is incomplete, incompatible, or internally inconsistent."""


def minute(text: str) -> int:
    value = datetime.strptime(re.sub(r"\s+", "", text.upper()), "%I:%M%p")
    return value.hour * 60 + value.minute


def iso_date(text: str) -> str:
    return (
        datetime.strptime(text, "%m/%d/%Y" if len(text) == 10 else "%m/%d/%y")
        .date()
        .isoformat()
    )


def cell_lines(cell) -> list[str]:
    return [
        re.sub(r"\s+", " ", x).strip()
        for x in cell.get_text("\n").splitlines()
        if x.strip()
    ]


def location_lines(cell) -> list[str]:
    # Empty BR-separated cells are meaningful positional placeholders.
    return [
        BeautifulSoup(x, "html.parser").get_text(" ", strip=True) or "TBA"
        for x in re.split(r"<br\s*/?>", cell.decode_contents(), flags=re.I)
    ]


def day_indices(text: str) -> list[int]:
    text = text.strip().upper().replace("TH", "R")
    if text in {"TBA", "ARR", "", "-"}:
        return []
    if not re.fullmatch(r"[MTWRFSU\s,]+", text):
        raise SourceError(f"Unknown day pattern: {text!r}")
    return sorted({DAY_INDEX[d] for d in text if d in DAY_INDEX})


def meeting_pairs(days: list[str], times: list[str]) -> list[tuple[str, str]]:
    # Expanded rows repeat the day immediately before each time, including TBA/TBA.
    if len(times) > 1:
        pairs, index = [], 0
        while index < len(times):
            token = times[index].strip().upper()
            if re.fullmatch(r"[MTWRFSU]+|TBA|ARR", token) and index + 1 < len(times):
                following = times[index + 1]
                if TIME_RANGE.fullmatch(following) or following.upper() in {
                    "TBA",
                    "ARR",
                }:
                    pairs.append((token, following))
                    index += 2
                    continue
            if TIME_RANGE.fullmatch(times[index]) or token in {"TBA", "ARR"}:
                pos = len(pairs)
                if len(days) not in {1, len(times)}:
                    raise SourceError("Cannot align meeting days and times")
                pairs.append((days[pos] if len(days) > 1 else days[0], times[index]))
                index += 1
                continue
            raise SourceError(f"Unrecognized meeting token: {times[index]!r}")
        return pairs
    return [(days[0] if days else "TBA", times[0] if times else "TBA")]


def parse_schedule(html: str, term_id: str) -> tuple[list[dict], dict]:
    soup = BeautifulSoup(html, "html.parser")
    table = soup.select_one("#classSchedule")
    if table is None:
        raise SourceError("Schedule table #classSchedule was not found")
    headers = [x.get_text(" ", strip=True) for x in table.select("thead th")]
    if not headers:
        headers = [
            x.get_text(" ", strip=True) for x in table.find("tr").find_all(["th", "td"])
        ]
    expected = [
        "Section",
        "Class Number",
        "Mode of Instruction",
        "Course Title",
        "Satisfies",
        "Units",
        "Type",
        "Days",
        "Times",
        "Instructor",
        "Location",
        "Dates",
        "Open Seats",
        "Notes",
    ]
    if headers != expected:
        raise SourceError(f"Schedule headers changed: {headers!r}")
    sections: dict[str, dict] = {}
    issues, duplicate_rows, row_count = [], 0, 0
    for row in table.select("tbody tr"):
        cells = row.find_all("td", recursive=False)
        if not cells:
            continue
        row_count += 1
        if len(cells) != 14:
            issues.append(
                {"row": row_count, "reason": f"Expected 14 cells, found {len(cells)}"}
            )
            continue
        texts = [x.get_text(" ", strip=True) for x in cells]
        number = texts[1]
        if not number.isdigit():
            issues.append({"row": row_count, "reason": "Invalid class number"})
            continue
        match = re.fullmatch(r"(.+?)\s+\(Section\s+(.+?)\)", texts[0]) or re.fullmatch(
            r"(.+?)Sec\s+(.+)", texts[0]
        )
        if not match:
            issues.append(
                {"classNumber": number, "reason": "Unrecognized section label"}
            )
            continue
        course, section_code = match.groups()
        subject = course.split()[0]
        section = {
            "id": f"{term_id}:{number}",
            "classNumber": number,
            "course": course,
            "subject": subject,
            "section": section_code,
            "title": texts[3],
            "modality": texts[2],
            "component": texts[6],
            "requirements": texts[4],
            "instructor": texts[9],
            "notes": texts[13].strip(),
            "status": "active",
            "college": None,
            "department": None,
            "courseLevel": None,
            "enrollment": None,
            "capacity": None,
            "waitlist": None,
            "combinedGroup": None,
            "combinedFlag": False,
            "weightingEligible": False,
            "enrollmentObservedAt": None,
            "meetings": [],
        }
        try:
            pairs = meeting_pairs(cell_lines(cells[7]), cell_lines(cells[8]))
            locations = location_lines(cells[10])
            dates = DATE_RANGE.findall(texts[11])
            if not dates:
                raise SourceError(f"Missing date range: {texts[11]!r}")
            if len(dates) not in {1, len(pairs)}:
                raise SourceError("Cannot align meeting dates")
            if len(locations) not in {0, 1, len(pairs)}:
                raise SourceError("Cannot align meeting locations")
            for index, (days, times) in enumerate(pairs):
                date_start, date_end = dates[index if len(dates) > 1 else 0]
                start_date, end_date = iso_date(date_start), iso_date(date_end)
                if end_date < start_date:
                    raise SourceError("Meeting dates end before they start")
                location = (
                    locations[index if len(locations) > 1 else 0]
                    if locations
                    else "TBA"
                )
                time_match = TIME_RANGE.fullmatch(times)
                start, end = (
                    (minute(time_match[1]), minute(time_match[2]))
                    if time_match
                    else (None, None)
                )
                if start is not None and end <= start:
                    raise SourceError("Unsupported overnight or nonpositive meeting")
                parsed_days = day_indices(days)
                if time_match is None and times.upper() not in {"TBA", "ARR", "", "-"}:
                    raise SourceError(f"Unrecognized time: {times!r}")
                timed = bool(parsed_days and start is not None)
                meeting = {
                    "days": parsed_days,
                    "startMinute": start,
                    "endMinute": end,
                    "startDate": start_date,
                    "endDate": end_date,
                    "location": location,
                    "kind": (
                        "scheduled"
                        if timed
                        else (
                            "asynchronous" if texts[2] == "Fully Online" else "unknown"
                        )
                    ),
                }
                if meeting not in section["meetings"]:
                    section["meetings"].append(meeting)
        except (ValueError, IndexError) as exc:
            issues.append({"classNumber": number, "reason": str(exc)})
            continue
        if number in sections:
            previous = sections[number]
            if (previous["course"], previous["component"]) != (course, texts[6]):
                raise SourceError(f"Conflicting class identity: {number}")
            duplicate_rows += 1
            for meeting in section["meetings"]:
                if meeting not in previous["meetings"]:
                    previous["meetings"].append(meeting)
        else:
            sections[number] = section
    if not sections:
        raise SourceError("The semester schedule is empty")
    quality = {
        "sourceRows": row_count,
        "sections": len(sections),
        "duplicateRows": duplicate_rows,
        "parseIssues": issues,
        "timedSections": sum(
            any(m["kind"] == "scheduled" for m in s["meetings"])
            for s in sections.values()
        ),
    }
    # Publishing a partial parse silently would make quiet periods look safer than they are.
    if issues:
        raise SourceError(
            f"{len(issues)} schedule rows could not be normalized. Examples: {issues[:5]!r}"
        )
    return list(sections.values()), quality
