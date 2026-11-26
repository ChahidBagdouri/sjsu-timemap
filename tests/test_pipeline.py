"""Regression tests for real source structures and publication/deployment safeguards."""

import csv
import importlib.util
import io
from pathlib import Path
import unittest
from pipeline.schedule import parse_schedule, SourceError
from pipeline.enrollment import parse_enrollment, join_enrollment

FIXTURES = Path(__file__).parent / "fixtures"


class ScheduleTests(unittest.TestCase):
    def test_multiple_meetings_and_empty_location_positions(self):
        sections, quality = parse_schedule(
            (FIXTURES / "schedule.html").read_text(encoding="utf-8"), "fall-2026"
        )
        data = {s["classNumber"]: s for s in sections}
        self.assertEqual(quality["parseIssues"], [])
        self.assertEqual(data["47822"]["meetings"][0]["endMinute"], 615)
        self.assertEqual(len(data["41908"]["meetings"]), 5)
        self.assertEqual(data["41908"]["meetings"][4]["location"], "TBA")
        self.assertEqual(data["48877"]["course"], "CHAD 196")

    def test_duplicate_source_rows_do_not_double_sections(self):
        raw = (FIXTURES / "schedule.html").read_text(encoding="utf-8")
        sections, quality = parse_schedule(raw, "fall-2026")
        self.assertEqual(quality["duplicateRows"], 1)
        self.assertEqual(len(sections), 4)

    def test_unparsed_times_fail_publication(self):
        raw = (
            (FIXTURES / "schedule.html")
            .read_text(encoding="utf-8")
            .replace("09:00AM-10:15AM", "tomorrow")
        )
        with self.assertRaises(SourceError):
            parse_schedule(raw, "fall-2026")

    def test_changed_headers_fail_publication(self):
        raw = (
            (FIXTURES / "schedule.html")
            .read_text(encoding="utf-8")
            .replace("Open Seats", "Vacancies")
        )
        with self.assertRaises(SourceError):
            parse_schedule(raw, "fall-2026")


class EnrollmentTests(unittest.TestCase):
    def blob(self, rows, utf16=False):
        text = io.StringIO()
        writer = csv.writer(text, delimiter="\t")
        writer.writerow(
            [
                "Class Nbr",
                "Class Stat",
                "All Stdnts",
                "Max Enr",
                "Cmb Sec",
                "sctn_combined_id",
                "College",
            ]
        )
        writer.writerows(rows)
        return text.getvalue().encode("utf-16" if utf16 else "utf-8")

    def test_utf16_subtotals_zero_and_statuses(self):
        rows = [
            ["12345", "A", "0.0", "40", "", "", "Science"],
            ["12346", "X", "20", "40", "", "", "Science"],
            ["Total", "Total", "20", "80", "", "", "Science"],
            ["12347", "T", "", "40", "", "", "Science"],
            ["12348", "S", "30", "40", "", "", "Science"],
        ]
        records, q = parse_enrollment(self.blob(rows, True))
        self.assertEqual(q["subtotalRowsRemoved"], 1)
        self.assertEqual(records["12345"]["enrollment"], 0)
        self.assertEqual(records["12346"]["status"], "canceled")
        self.assertEqual(records["12347"]["status"], "tentative")
        self.assertEqual(records["12348"]["sourceClassStatus"], "S")
        self.assertEqual(records["12348"]["status"], "active")

    def test_missing_and_combined_enrollment_remain_unweighted(self):
        rows = [
            ["12345", "A", "", "40", "", "", "Science"],
            ["12346", "A", "30", "40", "Y", "9", "Science"],
        ]
        records, _ = parse_enrollment(self.blob(rows))
        sections = [{"classNumber": n} for n in ["12345", "12346", "12347"]]
        q = join_enrollment(sections, records, "2026-11-25T00:00:00Z")
        self.assertEqual(q["weightableSections"], 0)
        self.assertEqual(q["enrollmentMatches"], 2)

    def test_conflicting_duplicate_counts_fail(self):
        rows = [
            ["12345", "A", "20", "40", "", "", "Science"],
            ["12345", "A", "21", "40", "", "", "Science"],
        ]
        with self.assertRaises(SourceError):
            parse_enrollment(self.blob(rows))

    def test_wrong_worksheet_is_rejected(self):
        with self.assertRaises(SourceError):
            parse_enrollment(b"Name,Value\nTotal,42\n")


class DeployTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location(
            "deploy", Path(__file__).parents[1] / "scripts/deploy_sftp.py"
        )
        cls.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.module)

    def test_rejects_host_roots_and_parent_traversal(self):
        for value in [
            "/",
            "/srv/site/www",
            "/sjsu-timemap",
            "/srv/site/www/../sjsu-timemap",
            "relative/sjsu-timemap",
            "/srv/site/www/other",
        ]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.module.validate_destination(value)

    def test_accepts_only_the_app_directory(self):
        self.assertEqual(
            self.module.validate_destination("/srv/site/www/sjsu-timemap/"),
            "/srv/site/www/sjsu-timemap",
        )


if __name__ == "__main__":
    unittest.main()
