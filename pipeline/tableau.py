"""Public ESSD export adapter, including Tableau's modern startSession handshake.

Only the same anonymous crosstab export offered in the dashboard is requested.
The underlying-data permission is not used. No university credentials are needed.
"""

from __future__ import annotations
import json
from pathlib import Path
import re
from urllib.parse import urlencode
import requests
from tableauscraper import TableauScraper, api, utils
from .schedule import SourceError

HOST = "https://prd-analytics.sjsu.edu"
VIEW = "/t/IRPublic/views/EnrollmentStatusSummaryDashboard/ESSD"


class BoundedSession(requests.Session):
    def request(self, *args, **kwargs):
        kwargs.setdefault("timeout", 120)
        response = super().request(*args, **kwargs)
        response.raise_for_status()
        return response


def open_workbook():
    client = TableauScraper(delayMs=1000)
    client.session = BoundedSession()
    client.host = HOST
    params = {":embed": "y", ":showVizHome": "no", ":redirect": "auth"}
    location = HOST + VIEW + "?" + urlencode(params)
    response = client.session.post(
        HOST
        + "/vizql/t/IRPublic/w/EnrollmentStatusSummaryDashboard/v/ESSD/startSession/viewing",
        params=params,
        headers={
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
            "Tableau-Viz-Location": location,
        },
    )
    client.tableauData = response.json()
    routing_key = response.headers.get(
        "Global-Session-Header"
    ) or client.tableauData.get("vizqlRoutingKey")
    if routing_key:
        client.session.headers["Global-Session-Header"] = routing_key
    bootstrap = api.getTableauData(client)
    match = re.search(r"\d+;({.*})\d+;({.*})", bootstrap, re.MULTILINE)
    if not match:
        raise SourceError("Tableau bootstrap structure changed")
    client.info, client.data = json.loads(match[1]), json.loads(match[2])
    client.dashboard = client.info["sheetName"]
    pres = client.data.get("secondaryInfo", {}).get("presModelMap", {})
    client.dataSegments = (
        pres.get("dataDictionary", {})
        .get("presModelHolder", {})
        .get("genDataDictionaryPresModel", {})
        .get("dataSegments", {})
    )
    client.filters = utils.getFiltersForAllWorksheet(
        client.logger, client.data, client.info, rootDashboard=client.dashboard
    )
    return client, client.getWorkbook()


def quick_filters(value):
    """Read filter names and session-specific field IDs from the public response."""
    if isinstance(value, dict):
        if "quickFilterDisplay" in value:
            model = value["quickFilterDisplay"]
            yield model.get("quickFilterTitle", {}).get("caption"), model["quickFilter"]
        for child in value.values():
            yield from quick_filters(child)
    elif isinstance(value, list):
        for child in value:
            yield from quick_filters(child)


def apply_filter(
    client, field: str, values: list[str], all_values: bool = False
) -> dict:
    # The storyboard context is essential. A dashboard-level filter can appear to
    # succeed while leaving the captured story's semester unchanged.
    payload = {
        "visualIdPresModel": json.dumps(
            {
                "worksheet": "Sections_subtotal",
                "dashboard": "by College, Department",
                "storyboard": "ESSD",
                "storyPointId": 1,
            }
        ),
        "globalFieldName": field,
        "membershipTarget": "filter",
        "filterValues": json.dumps(values),
        "filterUpdateType": "filter-all" if all_values else "filter-replace",
        "heuristicCommandReinterpretation": "do-not-reinterpret-command",
    }
    response = client.session.post(
        f'{HOST}{client.tableauData["vizql_root"]}/sessions/{client.tableauData["sessionid"]}/commands/tabdoc/categorical-filter',
        files={key: (None, value) for key, value in payload.items()},
    ).json()
    commands = response.get("vqlCmdResponse", {}).get("cmdResultList", [])
    if not commands:
        raise SourceError("Tableau did not acknowledge a filter update")
    for command in commands:
        result = command.get("commandReturn", {})
        if (
            result.get("parameterError")
            or result.get("invalidValues")
            or result.get("invalidFieldName")
        ):
            raise SourceError(f"Tableau rejected a filter: {result!r}")
    return response


def download_enrollment(term_id: str, destination: Path) -> None:
    from .enrollment import parse_enrollment
    from datetime import datetime, timezone

    client, workbook = open_workbook()
    try:
        response = api.setActiveStoryPoint(client, storyBoard="ESSD", storyPointId=1)
        filters = dict(quick_filters(response))
        if "Term" not in filters or "College" not in filters:
            raise SourceError("Tableau term/college filters changed")
        # Clear any captured restrictions so a default college or session cannot
        # masquerade as a full-semester snapshot.
        for name, model in filters.items():
            if name != "Term" and model.get("selectionSummary") != "(All)":
                apply_filter(client, model["fn"], [], all_values=True)
        label = term_id.replace("-", " ").title()
        response = apply_filter(client, filters["Term"]["fn"], [label])
        state = dict(quick_filters(response))
        confirmed = state.get("Term", filters["Term"]).get("selectionSummary")
        if confirmed != label:
            raise SourceError(f"Tableau did not confirm the requested semester {label}")
        table = workbook.getCrossTabData("Sections_subtotal")
        if table is None or table.empty:
            raise SourceError("The public section crosstab was empty")
        blob = table.to_csv(index=False).encode("utf-8")
        destination.with_suffix(".candidate.csv").write_bytes(blob)
        records, quality = parse_enrollment(blob)
        if len(quality["exportColleges"]) < 8:
            raise SourceError(
                f"Enrollment export appears college-filtered: {quality['exportColleges']}"
            )
        temporary = destination.with_suffix(".csv.tmp")
        temporary.write_bytes(blob)
        temporary.replace(destination)
        metadata = {
            "term": label,
            "termConfirmed": True,
            "colleges": "all",
            "quality": quality,
            "observedAt": datetime.now(timezone.utc).isoformat(),
            "sourceDataDate": None,
            "method": "anonymous-public-crosstab",
            "rows": len(table),
            "sections": len(records),
        }
        destination.with_suffix(".meta.json").write_text(
            json.dumps(metadata, indent=2), encoding="utf-8"
        )
        print(json.dumps({"enrollmentExport": term_id, **quality}), flush=True)
    finally:
        client.session.close()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("term", help="e.g. fall-2026")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    output = args.output or Path("data/raw") / f"{args.term}-enrollment.csv"
    output.parent.mkdir(parents=True, exist_ok=True)
    download_enrollment(args.term, output)
