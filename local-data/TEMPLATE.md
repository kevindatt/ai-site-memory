# Local register templates — exact column requirements

Copy each block into a `.csv` file whose name contains the keyword shown.
First row MUST be the header row, spelled exactly as below (lowercase with
underscores). Dates MUST be `YYYY-MM-DD` (e.g. `2026-09-18`). Leave a cell
empty when you have no value — never write `N/A` or `?`.

Using `.xlsx` instead? Headers are auto-mapped (see “Real-file rules”
below) — this template is still the canonical reference.

Related columns (`related_ncr`, `related_drawing`, `related_wir`,
`related_mir`, `related_document`) link records together: write the exact id
of the other record (e.g. `NCR-031`). Several links may share one cell,
separated by newlines or semicolons. Links to ids that do not exist are
reported as errors (same-kind links) or warnings (drawing references).
`NA`, `N/A` and `-` mean “no link”.

## Optional columns (all registers except NCR)

`revision`, `review_started` (`YYYY-MM-DD`), `consultant_status` may be
added to WIR/MIR/RFI/Drawing/Submittal files. They appear in answers only
when present. Same document number across different revisions is a revision
family — answers describe the latest revision and say how many are on file.

## Real-file rules (automatic, reported — never silent)

- Header row is detected past title/meta rows; missing required columns skip
  the sheet with the reason shown.
- Header variants map automatically (`WIR ID`, `Current Holder`,
  `Date Submitted`, …); first status-like column wins `status`, later ones
  become `consultant_status`; unmapped columns are listed as dropped.
- Location composes from zone/venue/level parts in file order.
- Excel serial dates and unambiguous date strings convert to `YYYY-MM-DD`;
  ambiguous formats are left for diagnostics to flag.
- Statuses stay VERBATIM — never normalized; `due_date` and `issue_date`
  are optional.

---

## 1. WIR register — filename must contain `wir`

```csv
wir_id,project,location,activity,submission_date,status,current_holder,due_date,related_ncr,related_drawing
WIR-1842,Qubators Demo Project,Villa 43,Ground Floor Ceiling Works,2026-09-18,Pending Consultant Review,Consultant QA,2026-09-21,NCR-031,AR-043-Rev-C
```

| Column | Required | Meaning |
|---|---|---|
| `wir_id` | yes | Unique record id (`WIR-…`) |
| `project` | no | Project name |
| `location` | yes | Where the work is (drives location scoping) |
| `activity` | no | Work description |
| `submission_date` | yes | `YYYY-MM-DD` |
| `status` | yes | Exact status text; include the word `Overdue` to flag overdue |
| `current_holder` | no | Who holds it now (empty = nobody recorded) |
| `due_date` | yes | `YYYY-MM-DD` |
| `related_ncr` | no | Linked NCR id |
| `related_drawing` | no | Linked drawing id |

## 2. MIR register — filename must contain `mir`

```csv
mir_id,project,location,material,description,submission_date,status,current_holder,related_document
MIR-302,Qubators Demo Project,Townhouse 12,Oak Veneer,Oak veneer for feature wall,2026-09-23,Under Review,Consultant Materials,MS-TH12-VEN-02
```

| Column | Required | Meaning |
|---|---|---|
| `mir_id` | yes | Unique record id (`MIR-…`) |
| `location` | yes | Where the material is used |
| `material` | yes | Material name (used for material questions) |
| `description` | no | Free-text description |
| `submission_date` | yes | `YYYY-MM-DD` |
| `status` | yes | e.g. `Draft`, `Under Review`, `Approved` |
| `current_holder` | no | Reviewer holder (empty = not issued) |
| `related_document` | no | Linked document id (`MS-…` allowed without an ingested copy) |

## 3. NCR register — filename must contain `ncr`

```csv
ncr_id,project,location,subject,status,opened_date,related_wir,related_drawing
NCR-031,Qubators Demo Project,Villa 43,Incorrect ceiling cove detail,Open,2026-09-19,WIR-1842,AR-043-Rev-C
```

| Column | Required | Meaning |
|---|---|---|
| `ncr_id` | yes | Unique record id (`NCR-…`) |
| `location` | no | Affected location |
| `subject` | yes | Defect description |
| `status` | yes | e.g. `Open`, `Closed` |
| `opened_date` | yes | `YYYY-MM-DD` |
| `related_wir` | no | Linked WIR id |
| `related_drawing` | no | Linked drawing id |

## 4. RFI register — filename must contain `rfi`

```csv
rfi_id,project,location,subject,status,submitted_date,related_drawing
RFI-078,Qubators Demo Project,Cafe,Timber ceiling coordination,Open,2026-09-22,AR-CAFE-007-Rev-A
```

| Column | Required | Meaning |
|---|---|---|
| `rfi_id` | yes | Unique record id (`RFI-…`) |
| `location` | no | Related location |
| `subject` | yes | Question/coordination subject |
| `status` | yes | e.g. `Open`, `Closed` |
| `submitted_date` | no | `YYYY-MM-DD` |
| `related_drawing` | no | Linked drawing id |

## 5. Drawing register — filename must contain `drawing`

```csv
drawing_id,project,title,revision,status,issue_date,location
AR-043-Rev-C,Qubators Demo Project,Villa 43 Ceiling Detail,C,Approved,2026-09-15,Villa 43
```

| Column | Required | Meaning |
|---|---|---|
| `drawing_id` | yes | Unique id including revision (`AR-043-Rev-C`) |
| `title` | yes | Drawing title (same title = same revision family) |
| `revision` | yes | Revision letter |
| `status` | yes | Only `Approved` can win “latest approved”; `Superseded`/`For Review` never win |
| `issue_date` | yes | `YYYY-MM-DD` (latest approved = newest date among Approved) |
| `location` | no | Covered location |

## 6. Submittal register — filename must contain `submittal`

```csv
submittal_id,project,location,subject,material,revision,status,submission_date,related_mir,related_document
SUB-118,Qubators Demo Project,Townhouse 12,Oak veneer feature wall submission,Oak Veneer,1,Approved,2026-09-21,MIR-302,MS-TH12-VEN-02
```

| Column | Required | Meaning |
|---|---|---|
| `submittal_id` | yes | Unique record id (`SUB-…`) |
| `location` / `subject` / `material` | subject yes, others no | What/where description |
| `revision` | no | Revision number |
| `status` | yes | e.g. `Approved`, `Under Review` |
| `submission_date` | no | `YYYY-MM-DD` |
| `related_mir` | no | Linked MIR id |
| `related_document` | no | Linked document id |

---

## Quick checklist before loading

1. Six CSVs present with the right filename keywords.
2. Headers spelled exactly as above.
3. Dates in `YYYY-MM-DD`.
4. Run `npm.cmd run ingest -- --source "<this folder>"` — fix any `[error]` lines; `[warning]` lines are safe to keep.
