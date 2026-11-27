# Known limitations

- Coverage follows the public semester schedule table. Extra ESSD sections without corresponding public-table meeting definitions are not assigned guessed meetings. Some programs publish separate schedules.
- Combined sections remain in section-count mode but are excluded from weights until shared-count semantics are verified. Weightable coverage appears in the interface.
- Source data dates are currently unavailable through these public exports; download times are labeled accordingly.
- Holidays, finals, exceptional cancellations, and exact dates of irregular intensive-course meetings are not modeled. Multiple patterns sometimes have only one broad source date range.
- Event-opportunity scores are uncalibrated relative indices. Nearby physical activity does not establish actual campus presence, student schedules across different sections, or attendance. Sensitivity across assumed buffers/windows is not statistical confidence.
- No exact unique-student total, major cohort, club roster, measured attendance, or room reservation availability is claimed.
- Canceled and tentative sections are excluded. Stopped enrollment is retained separately and is not treated as cancellation.
- Automatic discovery currently targets spring/fall. Other terms can be explicitly imported when their enrollment export is available.
- Semester-comparison UI and longer daily enrollment history remain future work.
- GitHub native schedules can be delayed or disabled after 60 days without repository activity. Valid data observations produce real commits, but failure monitoring is still necessary.
- Tableau's public UI protocol is not a guaranteed long-term API contract. The adapter is isolated and protected by timeouts, filter assertions, and coverage gates.
- Production deployment requires the owner's explicit v1 approval. Gandi uploads remain disabled; connection secrets and a trusted host key are also required. Atomic SFTP rename support is required; the deployer fails safely if unavailable.
- The owner has not selected a source-code license.
